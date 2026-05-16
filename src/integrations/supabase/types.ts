export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analyst_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          id: string
          is_approved: boolean | null
          is_available: boolean | null
          languages: string[] | null
          rating: number | null
          sebi_reg_number: string
          sebi_type: string
          specializations: string[] | null
          total_sessions: number | null
          years_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          id: string
          is_approved?: boolean | null
          is_available?: boolean | null
          languages?: string[] | null
          rating?: number | null
          sebi_reg_number: string
          sebi_type: string
          specializations?: string[] | null
          total_sessions?: number | null
          years_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_approved?: boolean | null
          is_available?: boolean | null
          languages?: string[] | null
          rating?: number | null
          sebi_reg_number?: string
          sebi_type?: string
          specializations?: string[] | null
          total_sessions?: number | null
          years_experience?: number | null
        }
        Relationships: []
      }
      answers: {
        Row: {
          answer_type: Database["public"]["Enums"]["answer_type"]
          body: string | null
          created_at: string | null
          duration_seconds: number | null
          expert_id: string
          id: string
          is_published: boolean | null
          query_id: string
          video_thumbnail: string | null
          video_url: string | null
        }
        Insert: {
          answer_type: Database["public"]["Enums"]["answer_type"]
          body?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          expert_id: string
          id?: string
          is_published?: boolean | null
          query_id: string
          video_thumbnail?: string | null
          video_url?: string | null
        }
        Update: {
          answer_type?: Database["public"]["Enums"]["answer_type"]
          body?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          expert_id?: string
          id?: string
          is_published?: boolean | null
          query_id?: string
          video_thumbnail?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
      market_cache: {
        Row: {
          data: Json
          expires_at: string
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          expires_at: string
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          expires_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_verified: boolean | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          sebi_reg_number: string | null
          sebi_type: string | null
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_verified?: boolean | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sebi_reg_number?: string | null
          sebi_type?: string | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_verified?: boolean | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sebi_reg_number?: string | null
          sebi_type?: string | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      queries: {
        Row: {
          ai_report: Json | null
          assigned_analyst_id: string | null
          buy_price: number | null
          created_at: string | null
          current_price: number | null
          id: string
          query_text: string
          query_type: string | null
          status: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          created_at?: string | null
          current_price?: number | null
          id?: string
          query_text: string
          query_type?: string | null
          status?: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          created_at?: string | null
          current_price?: number | null
          id?: string
          query_text?: string
          query_type?: string | null
          status?: Database["public"]["Enums"]["query_status"] | null
          stock_name?: string
          stock_symbol?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          payout: number | null
          referred_id: string
          referrer_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payout?: number | null
          referred_id: string
          referrer_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payout?: number | null
          referred_id?: string
          referrer_id?: string
          status?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          id: string
          query_id: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string | null
          description?: string | null
          id?: string
          query_id?: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          description?: string | null
          id?: string
          query_id?: string | null
          type?: Database["public"]["Enums"]["wallet_tx_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_demo_credits: { Args: { _amount: number }; Returns: Json }
      admin_adjust_wallet: {
        Args: { _amount: number; _reason: string; _target_user_id: string }
        Returns: Json
      }
      deduct_wallet_balance: {
        Args: {
          _amount: number
          _description: string
          _query_id?: string
          _user_id: string
        }
        Returns: Json
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      answer_type: "ai_report" | "text" | "video"
      app_role: "user" | "analyst" | "admin"
      query_status: "pending" | "ai_answered" | "expert_answered" | "in_review"
      wallet_tx_type: "credit" | "debit" | "referral_bonus" | "signup_bonus"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      answer_type: ["ai_report", "text", "video"],
      app_role: ["user", "analyst", "admin"],
      query_status: ["pending", "ai_answered", "expert_answered", "in_review"],
      wallet_tx_type: ["credit", "debit", "referral_bonus", "signup_bonus"],
    },
  },
} as const
