import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data: { user }, error: userError } = await supabase.auth.getUser(token)
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
        if (!OPENAI_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get ZenMoney categories (categories with zenmoney_id that are not yet mapped to existing categories)
        // These are categories that were created during sync but don't have a match yet
        const { data: allZmCategories } = await supabase
            .from('categories')
            .select('id, name, zenmoney_id')
            .eq('user_id', user.id)
            .not('zenmoney_id', 'is', null)

        // Get all existing categories (without zenmoney_id or with different zenmoney_id)
        const { data: allExistingCategories } = await supabase
            .from('categories')
            .select('id, name, icon, zenmoney_id')
            .eq('user_id', user.id)

        if (!allZmCategories || allZmCategories.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'No ZenMoney categories to map',
                    mappings: []
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get existing categories without zenmoney_id for mapping (user's original categories)
        const existingCategories = (allExistingCategories || []).filter(c => !c.zenmoney_id)

        // Filter: ZenMoney categories that need mapping
        // These are categories created from ZenMoney that should be mapped to existing user categories
        const zmCategories = allZmCategories.filter(c => c.zenmoney_id)

        if (zmCategories.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'No ZenMoney categories to map',
                    mappings: []
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!existingCategories || existingCategories.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'No existing categories to map to. ZenMoney categories will remain as separate categories.',
                    mappings: []
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!existingCategories || existingCategories.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'No existing categories to map to',
                    mappings: []
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Prepare data for AI
        const zmCategoriesList = zmCategories.map(c => c.name).join(', ')
        const existingCategoriesList = existingCategories.map(c => `${c.icon} ${c.name}`).join(', ')

        const aiPrompt = `Ты - помощник по сопоставлению категорий расходов.

У пользователя есть категории из ZenMoney, которые нужно сопоставить с существующими категориями в CrystalBudget.

Категории из ZenMoney:
${zmCategories.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}

Существующие категории в CrystalBudget:
${existingCategories.map((c, i) => `${i + 1}. ${c.icon} ${c.name}`).join('\n')}

Твоя задача: для каждой категории из ZenMoney найти наиболее подходящую категорию из CrystalBudget по смыслу.

Правила:
1. Сопоставляй категории по смыслу и назначению
2. Если категория из ZenMoney точно соответствует существующей - сопоставь её
3. Если категория из ZenMoney похожа на существующую - сопоставь её
4. Если нет подходящей категории - верни null для этой категории
5. Одна категория CrystalBudget может быть сопоставлена с несколькими категориями ZenMoney, если это логично

Ответь ТОЛЬКО в формате JSON (без markdown):
{
  "mappings": [
    {
      "zenmoney_category_name": "название категории из ZenMoney",
      "crystalbudget_category_name": "название категории из CrystalBudget или null"
    }
  ]
}`

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты - эксперт по сопоставлению финансовых категорий. Отвечай только в формате JSON.'
                    },
                    {
                        role: 'user',
                        content: aiPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2000,
            }),
        })

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text()
            console.error('OpenAI API error:', errorText)
            throw new Error('Failed to get AI mapping')
        }

        const aiData = await aiResponse.json()
        const aiContent = aiData.choices[0]?.message?.content

        if (!aiContent) {
            throw new Error('No response from AI')
        }

        // Parse AI response (remove markdown code blocks if present)
        let parsedContent = aiContent.trim()
        if (parsedContent.startsWith('```json')) {
            parsedContent = parsedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        } else if (parsedContent.startsWith('```')) {
            parsedContent = parsedContent.replace(/```\n?/g, '').trim()
        }

        const aiMappings = JSON.parse(parsedContent)

        // Apply mappings
        const appliedMappings: Array<{zenmoneyCategory: string, crystalbudgetCategory: string | null, success: boolean}> = []

        for (const mapping of aiMappings.mappings) {
            const zmCategory = zmCategories.find(c => c.name === mapping.zenmoney_category_name)
            if (!zmCategory) continue

            if (mapping.crystalbudget_category_name === null) {
                appliedMappings.push({
                    zenmoneyCategory: zmCategory.name,
                    crystalbudgetCategory: null,
                    success: true
                })
                continue
            }

            // Find category by name (remove icon if present)
            const targetCategoryName = mapping.crystalbudget_category_name.replace(/^[^\s]+\s/, '') // Remove emoji/icon
            const targetCategory = existingCategories.find(c => 
                c.name === targetCategoryName || c.name === mapping.crystalbudget_category_name
            )

            if (targetCategory) {
                // Check if target category already has a zenmoney_id
                const { data: targetCategoryData } = await supabase
                    .from('categories')
                    .select('zenmoney_id')
                    .eq('id', targetCategory.id)
                    .single()

                if (targetCategoryData?.zenmoney_id) {
                    // Target category already mapped to another ZenMoney category
                    // Skip this mapping
                    appliedMappings.push({
                        zenmoneyCategory: zmCategory.name,
                        crystalbudgetCategory: targetCategory.name,
                        success: false
                    })
                    continue
                }

                // Update target category with zenmoney_id
                const { error: updateError } = await supabase
                    .from('categories')
                    .update({ zenmoney_id: zmCategory.zenmoney_id })
                    .eq('id', targetCategory.id)

                if (!updateError) {
                    // Update expenses to use the target category instead of ZenMoney category
                    await supabase
                        .from('expenses')
                        .update({ category_id: targetCategory.id })
                        .eq('category_id', zmCategory.id)
                        .eq('user_id', user.id)

                    // Delete the duplicate ZenMoney category
                    await supabase
                        .from('categories')
                        .delete()
                        .eq('id', zmCategory.id)
                        .eq('user_id', user.id)

                    appliedMappings.push({
                        zenmoneyCategory: zmCategory.name,
                        crystalbudgetCategory: targetCategory.name,
                        success: true
                    })
                } else {
                    console.error('Error updating category:', updateError)
                    appliedMappings.push({
                        zenmoneyCategory: zmCategory.name,
                        crystalbudgetCategory: targetCategory.name,
                        success: false
                    })
                }
            } else {
                appliedMappings.push({
                    zenmoneyCategory: zmCategory.name,
                    crystalbudgetCategory: mapping.crystalbudget_category_name,
                    success: false
                })
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Categories mapped successfully',
                mappings: appliedMappings,
                totalMapped: appliedMappings.filter(m => m.success && m.crystalbudgetCategory).length
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

