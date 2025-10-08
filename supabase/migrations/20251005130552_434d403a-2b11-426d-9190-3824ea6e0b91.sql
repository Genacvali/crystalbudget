-- Create families table
CREATE TABLE public.families (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Моя семья',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create family_members table
CREATE TABLE public.family_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(family_id, user_id)
);

-- Create family_invite_codes table
CREATE TABLE public.family_invite_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invite_codes ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user is in same family
CREATE OR REPLACE FUNCTION public.is_family_member(_user_id UUID, _target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    WHERE fm1.user_id = _user_id AND fm2.user_id = _target_user_id
  );
$$;

-- RLS Policies for families
CREATE POLICY "Users can view their own family"
ON public.families FOR SELECT
USING (
  owner_id = auth.uid() OR 
  id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create their own family"
ON public.families FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Family owners can update their family"
ON public.families FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Family owners can delete their family"
ON public.families FOR DELETE
USING (owner_id = auth.uid());

-- RLS Policies for family_members
CREATE POLICY "Users can view members of their family"
ON public.family_members FOR SELECT
USING (
  family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid()) OR
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

CREATE POLICY "Family owners can add members"
ON public.family_members FOR INSERT
WITH CHECK (
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can remove themselves from family"
ON public.family_members FOR DELETE
USING (
  user_id = auth.uid() OR
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

-- RLS Policies for family_invite_codes
CREATE POLICY "Users can view codes for their family"
ON public.family_invite_codes FOR SELECT
USING (
  family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid()) OR
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

CREATE POLICY "Family owners can create invite codes"
ON public.family_invite_codes FOR INSERT
WITH CHECK (
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

CREATE POLICY "Family owners can delete invite codes"
ON public.family_invite_codes FOR DELETE
USING (
  family_id IN (SELECT id FROM public.families WHERE owner_id = auth.uid())
);

-- Update RLS policies for existing tables to include family members

-- Categories policies
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categories;

CREATE POLICY "Users can view their own and family categories"
ON public.categories FOR SELECT
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can create their own categories"
ON public.categories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own and family categories"
ON public.categories FOR UPDATE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can delete their own and family categories"
ON public.categories FOR DELETE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

-- Expenses policies
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

CREATE POLICY "Users can view their own and family expenses"
ON public.expenses FOR SELECT
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can create their own expenses"
ON public.expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own and family expenses"
ON public.expenses FOR UPDATE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can delete their own and family expenses"
ON public.expenses FOR DELETE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

-- Incomes policies
DROP POLICY IF EXISTS "Users can view their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can create their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can update their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can delete their own incomes" ON public.incomes;

CREATE POLICY "Users can view their own and family incomes"
ON public.incomes FOR SELECT
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can create their own incomes"
ON public.incomes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own and family incomes"
ON public.incomes FOR UPDATE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can delete their own and family incomes"
ON public.incomes FOR DELETE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

-- Income sources policies
DROP POLICY IF EXISTS "Users can view their own income sources" ON public.income_sources;
DROP POLICY IF EXISTS "Users can create their own income sources" ON public.income_sources;
DROP POLICY IF EXISTS "Users can update their own income sources" ON public.income_sources;
DROP POLICY IF EXISTS "Users can delete their own income sources" ON public.income_sources;

CREATE POLICY "Users can view their own and family income sources"
ON public.income_sources FOR SELECT
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can create their own income sources"
ON public.income_sources FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own and family income sources"
ON public.income_sources FOR UPDATE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

CREATE POLICY "Users can delete their own and family income sources"
ON public.income_sources FOR DELETE
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own and family profiles"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR public.is_family_member(auth.uid(), user_id));

-- Trigger for updating families updated_at
CREATE TRIGGER update_families_updated_at
BEFORE UPDATE ON public.families
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();