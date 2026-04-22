-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'dpo', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'dpo')
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow reviewers to view ALL policies (in addition to existing owner-only policy)
CREATE POLICY "Reviewers can view all policies"
  ON public.policies FOR SELECT
  USING (public.is_reviewer(auth.uid()));

-- Reviews table
CREATE TABLE public.policy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_reviews_policy ON public.policy_reviews(policy_id);

ALTER TABLE public.policy_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view reviews of their policies"
  ON public.policy_reviews FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.policies p
            WHERE p.id = policy_reviews.policy_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Reviewers can view all reviews"
  ON public.policy_reviews FOR SELECT
  USING (public.is_reviewer(auth.uid()));

CREATE POLICY "Reviewers can create reviews"
  ON public.policy_reviews FOR INSERT
  WITH CHECK (public.is_reviewer(auth.uid()) AND auth.uid() = reviewer_id);

CREATE POLICY "Reviewers can update their reviews"
  ON public.policy_reviews FOR UPDATE
  USING (public.is_reviewer(auth.uid()) AND auth.uid() = reviewer_id);

CREATE POLICY "Admins can delete reviews"
  ON public.policy_reviews FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_policy_reviews_updated_at
  BEFORE UPDATE ON public.policy_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-promote the first signed-up user to admin
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();