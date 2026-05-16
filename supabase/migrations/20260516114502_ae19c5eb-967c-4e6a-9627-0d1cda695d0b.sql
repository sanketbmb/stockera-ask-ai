-- ENUMS
CREATE TYPE public.app_role AS ENUM ('user', 'analyst', 'admin');
CREATE TYPE public.query_status AS ENUM ('pending', 'ai_answered', 'expert_answered', 'in_review');
CREATE TYPE public.answer_type AS ENUM ('ai_report', 'text', 'video');
CREATE TYPE public.wallet_tx_type AS ENUM ('credit', 'debit', 'referral_bonus', 'signup_bonus');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  sebi_reg_number TEXT,
  sebi_type TEXT CHECK (sebi_type IN ('RA', 'RIA')),
  wallet_balance INTEGER DEFAULT 100,
  referral_code TEXT UNIQUE DEFAULT 'STK' || upper(substr(gen_random_uuid()::text, 1, 6)),
  referred_by UUID REFERENCES public.profiles(id),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE TABLE public.queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stock_name TEXT NOT NULL,
  stock_symbol TEXT,
  buy_price DECIMAL,
  current_price DECIMAL,
  query_text TEXT NOT NULL,
  query_type TEXT CHECK (query_type IN ('sell_or_hold', 'average_down', 'stop_loss', 'target', 'long_term', 'fresh_entry', 'other')),
  assigned_analyst_id UUID REFERENCES auth.users(id),
  status query_status DEFAULT 'pending',
  ai_report JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID REFERENCES public.queries(id) ON DELETE CASCADE NOT NULL,
  expert_id UUID REFERENCES auth.users(id) NOT NULL,
  answer_type answer_type NOT NULL,
  body TEXT,
  video_url TEXT,
  video_thumbnail TEXT,
  duration_seconds INTEGER,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  type wallet_tx_type NOT NULL,
  description TEXT,
  balance_after INTEGER NOT NULL DEFAULT 0,
  query_id UUID REFERENCES public.queries(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) NOT NULL,
  referred_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'credited')),
  payout INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.analyst_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  sebi_reg_number TEXT NOT NULL UNIQUE,
  sebi_type TEXT NOT NULL CHECK (sebi_type IN ('RA', 'RIA')),
  specializations TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{"English", "Hindi"}',
  years_experience INTEGER DEFAULT 1,
  rating DECIMAL DEFAULT 5.0,
  total_sessions INTEGER DEFAULT 0,
  bio TEXT,
  avatar_url TEXT,
  is_available BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyst_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "analyst_profiles_public_read" ON public.analyst_profiles FOR SELECT USING (is_approved = true);
CREATE POLICY "analyst_profiles_own" ON public.analyst_profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "queries_own" ON public.queries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "queries_analyst_read" ON public.queries FOR SELECT USING (auth.uid() = assigned_analyst_id);
CREATE POLICY "answers_read_query_owner" ON public.answers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.queries WHERE id = query_id AND user_id = auth.uid())
);
CREATE POLICY "answers_analyst_manage" ON public.answers FOR ALL USING (auth.uid() = expert_id);
CREATE POLICY "wallet_own" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "referrals_own" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, balance_after)
  VALUES (NEW.id, 100, 'signup_bonus', 'Welcome bonus — 2 free AI reports', 100);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;