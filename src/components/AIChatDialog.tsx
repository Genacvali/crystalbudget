import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, Paperclip, X, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/hooks/useFamily";

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface AIChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIChatDialog({ open, onOpenChange }: AIChatDialogProps) {
  const { user } = useAuth();
  const { effectiveUserId } = useFamily();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ type: string; url: string; name: string }>>([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) {
      scrollToBottom();
      if (!hasGreeted && messages.length === 0) {
        setHasGreeted(true);
        const welcomeMessage: Message = {
          role: 'assistant',
          content: `Привет! 👋 Я помогу с анализом финансов, обработкой чеков и документов. Что вас интересует?`
        };
        setMessages([welcomeMessage]);
      }
    }
  }, [open, hasGreeted, messages.length]);

  const handleToolCalls = async (toolCalls: any[]) => {
    if (!user || !effectiveUserId) return;

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function?.name;
      const args = JSON.parse(toolCall.function?.arguments || '{}');

      try {
        switch (functionName) {
          case 'create_category':
            await supabase.from('categories').insert({
              user_id: effectiveUserId,
              name: args.name,
              icon: args.icon,
            });
            toast({
              title: "Категория создана",
              description: `Категория "${args.name}" успешно создана`,
            });
            break;

          case 'update_category_allocation': {
            const { data: category } = await supabase
              .from('categories')
              .select('id')
              .eq('name', args.category_name)
              .eq('user_id', effectiveUserId)
              .maybeSingle();

            if (category) {
              const updateData: any = {};
              if (args.allocation_percent !== undefined) {
                updateData.allocation_percent = args.allocation_percent;
              }
              if (args.allocation_amount !== undefined) {
                updateData.allocation_amount = args.allocation_amount;
              }

              await supabase
                .from('categories')
                .update(updateData)
                .eq('id', category.id);

              toast({
                title: "Настройки обновлены",
                description: `Настройки категории "${args.category_name}" обновлены`,
              });
            } else {
              toast({
                title: "Категория не найдена",
                description: `Категория "${args.category_name}" не существует`,
                variant: "destructive",
              });
            }
            break;
          }

          case 'create_income_source':
            await supabase.from('income_sources').insert({
              user_id: effectiveUserId,
              name: args.name,
              amount: args.amount,
              color: '#10b981',
            });
            toast({
              title: "Источник дохода создан",
              description: `Источник "${args.name}" успешно создан`,
            });
            break;

          case 'add_expense': {
            const { data: categories } = await supabase
              .from('categories')
              .select('id')
              .eq('name', args.category_name)
              .eq('user_id', effectiveUserId)
              .single();

            if (categories) {
              await supabase.from('expenses').insert({
                user_id: user.id, // Keep original user for tracking
                category_id: categories.id,
                amount: args.amount,
                description: args.description,
                date: args.date || new Date().toISOString(),
              });
              toast({
                title: "Расход добавлен",
                description: `Расход ${args.amount} ₽ добавлен`,
              });
            }
            break;
          }

          case 'add_income': {
            const { data: sources } = await supabase
              .from('income_sources')
              .select('id')
              .eq('name', args.source_name)
              .eq('user_id', effectiveUserId)
              .single();

            if (sources) {
              await supabase.from('incomes').insert({
                user_id: user.id, // Keep original user for tracking
                source_id: sources.id,
                amount: args.amount,
                description: args.description,
                date: args.date || new Date().toISOString(),
              });
              toast({
                title: "Доход добавлен",
                description: `Доход ${args.amount} ₽ добавлен`,
              });
            }
            break;
          }

          case 'update_category': {
            const { data: category } = await supabase
              .from('categories')
              .select('id')
              .eq('name', args.old_name)
              .eq('user_id', effectiveUserId)
              .maybeSingle();

            if (category) {
              const updateData: any = {};
              if (args.new_name) updateData.name = args.new_name;
              if (args.icon) updateData.icon = args.icon;

              await supabase
                .from('categories')
                .update(updateData)
                .eq('id', category.id);

              toast({
                title: "Категория обновлена",
                description: `Категория "${args.old_name}" успешно обновлена`,
              });
            } else {
              toast({
                title: "Категория не найдена",
                description: `Категория "${args.old_name}" не существует`,
                variant: "destructive",
              });
            }
            break;
          }

          case 'delete_category': {
            const { data: category } = await supabase
              .from('categories')
              .select('id')
              .eq('name', args.name)
              .eq('user_id', effectiveUserId)
              .maybeSingle();

            if (category) {
              await supabase
                .from('categories')
                .delete()
                .eq('id', category.id);

              toast({
                title: "Категория удалена",
                description: `Категория "${args.name}" успешно удалена`,
              });
            } else {
              toast({
                title: "Категория не найдена",
                description: `Категория "${args.name}" не существует`,
                variant: "destructive",
              });
            }
            break;
          }

          case 'update_income_source': {
            const { data: source } = await supabase
              .from('income_sources')
              .select('id')
              .eq('name', args.old_name)
              .eq('user_id', effectiveUserId)
              .maybeSingle();

            if (source) {
              const updateData: any = {};
              if (args.new_name) updateData.name = args.new_name;
              if (args.amount !== undefined) updateData.amount = args.amount;

              await supabase
                .from('income_sources')
                .update(updateData)
                .eq('id', source.id);

              toast({
                title: "Источник обновлен",
                description: `Источник "${args.old_name}" успешно обновлен`,
              });
            } else {
              toast({
                title: "Источник не найден",
                description: `Источник "${args.old_name}" не существует`,
                variant: "destructive",
              });
            }
            break;
          }

          case 'delete_income_source': {
            const { data: source } = await supabase
              .from('income_sources')
              .select('id')
              .eq('name', args.name)
              .eq('user_id', effectiveUserId)
              .maybeSingle();

            if (source) {
              await supabase
                .from('income_sources')
                .delete()
                .eq('id', source.id);

              toast({
                title: "Источник удален",
                description: `Источник "${args.name}" успешно удален`,
              });
            } else {
              toast({
                title: "Источник не найден",
                description: `Источник "${args.name}" не существует`,
                variant: "destructive",
              });
            }
            break;
          }

          case 'update_expense': {
            let query = supabase
              .from('expenses')
              .select('id, category_id')
              .eq('user_id', user.id); // Keep original user for transactions

            if (args.description) {
              query = query.eq('description', args.description);
            }
            if (args.amount) {
              query = query.eq('amount', args.amount);
            }
            if (args.date) {
              query = query.gte('date', args.date).lt('date', args.date + 'T23:59:59');
            }

            const { data: expense } = await query.maybeSingle();

            if (expense) {
              const updateData: any = {};
              if (args.new_amount !== undefined) updateData.amount = args.new_amount;
              if (args.new_description) updateData.description = args.new_description;
              
              if (args.new_category_name) {
                const { data: newCategory } = await supabase
                  .from('categories')
                  .select('id')
                  .eq('name', args.new_category_name)
                  .eq('user_id', effectiveUserId)
                  .single();
                
                if (newCategory) {
                  updateData.category_id = newCategory.id;
                }
              }

              await supabase
                .from('expenses')
                .update(updateData)
                .eq('id', expense.id);

              toast({
                title: "Расход обновлен",
                description: "Расход успешно обновлен",
              });
            } else {
              toast({
                title: "Расход не найден",
                description: "Расход с такими параметрами не найден",
                variant: "destructive",
              });
            }
            break;
          }

          case 'delete_expense': {
            let query = supabase
              .from('expenses')
              .select('id')
              .eq('user_id', user.id); // Keep original user for transactions

            if (args.description) {
              query = query.eq('description', args.description);
            }
            if (args.amount) {
              query = query.eq('amount', args.amount);
            }
            if (args.date) {
              query = query.gte('date', args.date).lt('date', args.date + 'T23:59:59');
            }

            const { data: expense } = await query.maybeSingle();

            if (expense) {
              await supabase
                .from('expenses')
                .delete()
                .eq('id', expense.id);

              toast({
                title: "Расход удален",
                description: "Расход успешно удален",
              });
            } else {
              toast({
                title: "Расход не найден",
                description: "Расход с такими параметрами не найден",
                variant: "destructive",
              });
            }
            break;
          }

          case 'update_income': {
            let query = supabase
              .from('incomes')
              .select('id, source_id')
              .eq('user_id', user.id); // Keep original user for transactions

            if (args.description) {
              query = query.eq('description', args.description);
            }
            if (args.amount) {
              query = query.eq('amount', args.amount);
            }
            if (args.date) {
              query = query.gte('date', args.date).lt('date', args.date + 'T23:59:59');
            }

            const { data: income } = await query.maybeSingle();

            if (income) {
              const updateData: any = {};
              if (args.new_amount !== undefined) updateData.amount = args.new_amount;
              if (args.new_description) updateData.description = args.new_description;
              
              if (args.new_source_name) {
                const { data: newSource } = await supabase
                  .from('income_sources')
                  .select('id')
                  .eq('name', args.new_source_name)
                  .eq('user_id', effectiveUserId)
                  .single();
                
                if (newSource) {
                  updateData.source_id = newSource.id;
                }
              }

              await supabase
                .from('incomes')
                .update(updateData)
                .eq('id', income.id);

              toast({
                title: "Доход обновлен",
                description: "Доход успешно обновлен",
              });
            } else {
              toast({
                title: "Доход не найден",
                description: "Доход с такими параметрами не найден",
                variant: "destructive",
              });
            }
            break;
          }

          case 'delete_income': {
            let query = supabase
              .from('incomes')
              .select('id')
              .eq('user_id', user.id); // Keep original user for transactions

            if (args.description) {
              query = query.eq('description', args.description);
            }
            if (args.amount) {
              query = query.eq('amount', args.amount);
            }
            if (args.date) {
              query = query.gte('date', args.date).lt('date', args.date + 'T23:59:59');
            }

            const { data: income } = await query.maybeSingle();

            if (income) {
              await supabase
                .from('incomes')
                .delete()
                .eq('id', income.id);

              toast({
                title: "Доход удален",
                description: "Доход успешно удален",
              });
            } else {
              toast({
                title: "Доход не найден",
                description: "Доход с такими параметрами не найден",
                variant: "destructive",
              });
            }
            break;
          }
        }
      } catch (error) {
        console.error('Tool call error:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось выполнить действие",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: typeof attachments = [];

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "Файл слишком большой",
          description: `${file.name} превышает 20MB`,
          variant: "destructive",
        });
        continue;
      }

      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onload = () => {
          const base64 = reader.result as string;
          newAttachments.push({
            type: file.type.startsWith('image/') ? 'image' : 'document',
            url: base64,
            name: file.name,
          });
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const userMessageContent: Message['content'] = [];
    
    if (input.trim()) {
      userMessageContent.push({ type: 'text', text: input.trim() });
    }

    attachments.forEach(att => {
      if (att.type === 'image') {
        userMessageContent.push({
          type: 'image_url',
          image_url: { url: att.url }
        });
      } else {
        userMessageContent.push({
          type: 'text',
          text: `[Документ: ${att.name}]`
        });
      }
    });

    const userMessage: Message = {
      role: 'user',
      content: userMessageContent.length === 1 && typeof userMessageContent[0] === 'object' && 'text' in userMessageContent[0]
        ? userMessageContent[0].text!
        : userMessageContent
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Необходима авторизация");
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          userId: user?.id
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Ошибка при отправке запроса");
      }

      if (!resp.body) throw new Error("Нет данных в ответе");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      let assistantContent = "";
      let toolCalls: any[] = [];

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            
            if (delta?.content) {
              assistantContent += delta.content;
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg?.role === 'assistant' && !lastMsg.tool_calls) {
                  newMessages[newMessages.length - 1] = {
                    role: 'assistant',
                    content: assistantContent
                  };
                } else {
                  newMessages.push({
                    role: 'assistant',
                    content: assistantContent
                  });
                }
                return newMessages;
              });
            }

            if (delta?.tool_calls) {
              toolCalls = [...toolCalls, ...delta.tool_calls];
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Handle tool calls
      if (toolCalls.length > 0) {
        await handleToolCalls(toolCalls);
        
        // Add assistant confirmation message
        const confirmationMsg: Message = {
          role: 'assistant',
          content: 'Готово! Я выполнил все необходимые действия. ✅'
        };
        setMessages(prev => [...prev, confirmationMsg]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось получить ответ от AI",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessageContent = (content: Message['content']) => {
    if (typeof content === 'string') {
      return content.split('\n').map((line, idx) => {
        // Обработка заголовков с **
        if (line.includes('**')) {
          const parts = line.split('**');
          return (
            <p key={idx} className="my-2">
              {parts.map((part, i) => 
                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
              )}
            </p>
          );
        }
        // Обычный текст
        return line ? <p key={idx} className="my-1">{line}</p> : <br key={idx} />;
      });
    }
    
    return content.map((item, idx) => {
      if ('text' in item) {
        return <p key={idx} className="whitespace-pre-wrap">{item.text}</p>;
      }
      if ('image_url' in item) {
        return (
          <img
            key={idx}
            src={item.image_url?.url}
            alt="Загруженное изображение"
            className="max-w-full rounded-lg my-2"
          />
        );
      }
      return null;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setHasGreeted(false);
      }
    }}>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Финансовый Ассистент
          </DialogTitle>
          <DialogDescription>
            Задавайте вопросы, загружайте чеки и документы для анализа
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3 p-4 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.role === 'user'
                    ? "bg-primary/10 ml-8"
                    : "bg-muted/50 mr-8"
                )}
              >
                <div className="flex-1 text-sm leading-relaxed">
                  {formatMessageContent(msg.content)}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 p-4 rounded-lg bg-muted mr-8 animate-in fade-in">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">AI думает...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="px-6 pb-6 space-y-3">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg text-sm"
                >
                  {att.type === 'image' ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="max-w-[150px] truncate">{att.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeAttachment(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Задайте вопрос или опишите проблему..."
              className="min-h-[60px] resize-none"
              disabled={isLoading}
            />

            <Button
              onClick={sendMessage}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              size="icon"
              className="h-[60px]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
