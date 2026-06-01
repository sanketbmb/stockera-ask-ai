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
      ai_reports: {
        Row: {
          analyst_assigned_id: string | null
          created_at: string
          generated_at: string
          id: string
          intent: string
          llm_cost_usd: number | null
          llm_input_tokens: number | null
          llm_model: string
          llm_output_tokens: number | null
          llm_provider: string
          ltp_source: string | null
          ltp_timestamp: string | null
          ltp_value: number | null
          pnl_state: string | null
          prompt_version: string
          query_id: string
          raw_llm_response: Json | null
          rendered_sections: Json | null
          requires_analyst_review: boolean
          stock_exchange: string | null
          stock_symbol: string | null
          user_id: string
        }
        Insert: {
          analyst_assigned_id?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          intent: string
          llm_cost_usd?: number | null
          llm_input_tokens?: number | null
          llm_model: string
          llm_output_tokens?: number | null
          llm_provider: string
          ltp_source?: string | null
          ltp_timestamp?: string | null
          ltp_value?: number | null
          pnl_state?: string | null
          prompt_version: string
          query_id: string
          raw_llm_response?: Json | null
          rendered_sections?: Json | null
          requires_analyst_review?: boolean
          stock_exchange?: string | null
          stock_symbol?: string | null
          user_id: string
        }
        Update: {
          analyst_assigned_id?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          intent?: string
          llm_cost_usd?: number | null
          llm_input_tokens?: number | null
          llm_model?: string
          llm_output_tokens?: number | null
          llm_provider?: string
          ltp_source?: string | null
          ltp_timestamp?: string | null
          ltp_value?: number | null
          pnl_state?: string | null
          prompt_version?: string
          query_id?: string
          raw_llm_response?: Json | null
          rendered_sections?: Json | null
          requires_analyst_review?: boolean
          stock_exchange?: string | null
          stock_symbol?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
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
          key_level: string | null
          query_id: string
          report_filename: string | null
          report_label: string | null
          report_mime: string | null
          report_size_bytes: number | null
          report_url: string | null
          risk_note: string | null
          time_horizon: string | null
          verdict: string | null
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
          key_level?: string | null
          query_id: string
          report_filename?: string | null
          report_label?: string | null
          report_mime?: string | null
          report_size_bytes?: number | null
          report_url?: string | null
          risk_note?: string | null
          time_horizon?: string | null
          verdict?: string | null
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
          key_level?: string | null
          query_id?: string
          report_filename?: string | null
          report_label?: string | null
          report_mime?: string | null
          report_size_bytes?: number | null
          report_url?: string | null
          risk_note?: string | null
          time_horizon?: string | null
          verdict?: string | null
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
      audit_events: {
        Row: {
          actor_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          occurred_at: string
          payload: Json | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          payload?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          payload?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      benchmark_cache: {
        Row: {
          benchmark_symbol: string
          candle_count: number
          daily_candles: Json
          last_updated_at: string
        }
        Insert: {
          benchmark_symbol: string
          candle_count?: number
          daily_candles: Json
          last_updated_at?: string
        }
        Update: {
          benchmark_symbol?: string
          candle_count?: number
          daily_candles?: Json
          last_updated_at?: string
        }
        Relationships: []
      }
      cron_run_log: {
        Row: {
          details: Json | null
          id: number
          job_name: string
          rows_affected: number
          run_at: string
          status: string
        }
        Insert: {
          details?: Json | null
          id?: number
          job_name: string
          rows_affected?: number
          run_at?: string
          status?: string
        }
        Update: {
          details?: Json | null
          id?: number
          job_name?: string
          rows_affected?: number
          run_at?: string
          status?: string
        }
        Relationships: []
      }
      grievances: {
        Row: {
          against_analyst_id: string | null
          category: string
          complainant_email: string
          complainant_name: string
          complainant_phone: string | null
          created_at: string
          description: string
          escalated_to_scores: boolean
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          sla_due_at: string
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          against_analyst_id?: string | null
          category: string
          complainant_email: string
          complainant_name: string
          complainant_phone?: string | null
          created_at?: string
          description: string
          escalated_to_scores?: boolean
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_due_at?: string
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          against_analyst_id?: string | null
          category?: string
          complainant_email?: string
          complainant_name?: string
          complainant_phone?: string | null
          created_at?: string
          description?: string
          escalated_to_scores?: boolean
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_due_at?: string
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ltp_cache: {
        Row: {
          fetched_at: string
          ltp: number
          source: string
          symbol: string
        }
        Insert: {
          fetched_at?: string
          ltp: number
          source?: string
          symbol: string
        }
        Update: {
          fetched_at?: string
          ltp?: number
          source?: string
          symbol?: string
        }
        Relationships: []
      }
      ltp_history: {
        Row: {
          id: number
          ltp: number
          recorded_at: string
          source: string
          symbol: string
        }
        Insert: {
          id?: number
          ltp: number
          recorded_at?: string
          source?: string
          symbol: string
        }
        Update: {
          id?: number
          ltp?: number
          recorded_at?: string
          source?: string
          symbol?: string
        }
        Relationships: []
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
      marketaux_usage_log: {
        Row: {
          articles_returned: number
          call_count: number
          date: string
          updated_at: string
        }
        Insert: {
          articles_returned?: number
          call_count?: number
          date: string
          updated_at?: string
        }
        Update: {
          articles_returned?: number
          call_count?: number
          date?: string
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
      payments: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          order_id: string
          payment_id: string | null
          provider: string
          purpose: string
          query_id: string | null
          raw: Json | null
          signature: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          payment_id?: string | null
          provider?: string
          purpose?: string
          query_id?: string | null
          raw?: Json | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          payment_id?: string | null
          provider?: string
          purpose?: string
          query_id?: string | null
          raw?: Json | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdf_generation_log: {
        Row: {
          as_of_date: string | null
          cache_hit: boolean
          cache_key: string
          created_at: string
          duration_ms: number
          error_message: string | null
          horizon: string
          id: string
          include_news: boolean
          success: boolean
          symbol: string
          user_id: string | null
        }
        Insert: {
          as_of_date?: string | null
          cache_hit?: boolean
          cache_key: string
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          horizon: string
          id?: string
          include_news?: boolean
          success?: boolean
          symbol: string
          user_id?: string | null
        }
        Update: {
          as_of_date?: string | null
          cache_hit?: boolean
          cache_key?: string
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          horizon?: string
          id?: string
          include_news?: boolean
          success?: boolean
          symbol?: string
          user_id?: string | null
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
          onboarding_completed: boolean
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
          onboarding_completed?: boolean
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
          onboarding_completed?: boolean
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
          custom_question: string | null
          engine_source: string | null
          engine_version: string | null
          frozen_at: string | null
          horizon: string | null
          id: string
          intent: string | null
          orchestrator_response_id: string | null
          pnl_state: string | null
          query_text: string
          query_type: string | null
          regenerated_from_uuid: string | null
          report_artifact_status: string | null
          status: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol: string | null
          updated_at: string | null
          user_id: string
          video_payment_id: string | null
          video_requested: boolean
        }
        Insert: {
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          created_at?: string | null
          current_price?: number | null
          custom_question?: string | null
          engine_source?: string | null
          engine_version?: string | null
          frozen_at?: string | null
          horizon?: string | null
          id?: string
          intent?: string | null
          orchestrator_response_id?: string | null
          pnl_state?: string | null
          query_text: string
          query_type?: string | null
          regenerated_from_uuid?: string | null
          report_artifact_status?: string | null
          status?: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol?: string | null
          updated_at?: string | null
          user_id: string
          video_payment_id?: string | null
          video_requested?: boolean
        }
        Update: {
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          created_at?: string | null
          current_price?: number | null
          custom_question?: string | null
          engine_source?: string | null
          engine_version?: string | null
          frozen_at?: string | null
          horizon?: string | null
          id?: string
          intent?: string | null
          orchestrator_response_id?: string | null
          pnl_state?: string | null
          query_text?: string
          query_type?: string | null
          regenerated_from_uuid?: string | null
          report_artifact_status?: string | null
          status?: Database["public"]["Enums"]["query_status"] | null
          stock_name?: string
          stock_symbol?: string | null
          updated_at?: string | null
          user_id?: string
          video_payment_id?: string | null
          video_requested?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "queries_video_payment_id_fkey"
            columns: ["video_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
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
      risk_compute_meta: {
        Row: {
          last_benchmark: string | null
          last_beta: number | null
          last_beta_compute_at: string | null
          last_correlation: number | null
          last_r_squared: number | null
          stock_symbol: string
          updated_at: string
        }
        Insert: {
          last_benchmark?: string | null
          last_beta?: number | null
          last_beta_compute_at?: string | null
          last_correlation?: number | null
          last_r_squared?: number | null
          stock_symbol: string
          updated_at?: string
        }
        Update: {
          last_benchmark?: string | null
          last_beta?: number | null
          last_beta_compute_at?: string | null
          last_correlation?: number | null
          last_r_squared?: number | null
          stock_symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      sector_aggregates: {
        Row: {
          as_of_timestamp: string
          bootstrap_source_reference: string | null
          method_version: string
          pb_median: number | null
          pe_avg_5y: number | null
          pe_high_5y: number | null
          pe_low_5y: number | null
          pe_median: number
          pe_p25: number | null
          pe_p75: number | null
          return_12m_median_pct: number | null
          roe_median: number | null
          sample_size: number
          sector: string
          sector_canonical: string
          sector_display: string | null
          source: string
          updated_at: string
        }
        Insert: {
          as_of_timestamp?: string
          bootstrap_source_reference?: string | null
          method_version?: string
          pb_median?: number | null
          pe_avg_5y?: number | null
          pe_high_5y?: number | null
          pe_low_5y?: number | null
          pe_median: number
          pe_p25?: number | null
          pe_p75?: number | null
          return_12m_median_pct?: number | null
          roe_median?: number | null
          sample_size?: number
          sector: string
          sector_canonical: string
          sector_display?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          as_of_timestamp?: string
          bootstrap_source_reference?: string | null
          method_version?: string
          pb_median?: number | null
          pe_avg_5y?: number | null
          pe_high_5y?: number | null
          pe_low_5y?: number | null
          pe_median?: number
          pe_p25?: number | null
          pe_p75?: number | null
          return_12m_median_pct?: number | null
          roe_median?: number | null
          sample_size?: number
          sector?: string
          sector_canonical?: string
          sector_display?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      sentiment_cache: {
        Row: {
          articles: Json
          fetched_at: string
          symbol: string
          symbol_format_used: string | null
          ttl_hours: number
        }
        Insert: {
          articles: Json
          fetched_at?: string
          symbol: string
          symbol_format_used?: string | null
          ttl_hours?: number
        }
        Update: {
          articles?: Json
          fetched_at?: string
          symbol?: string
          symbol_format_used?: string | null
          ttl_hours?: number
        }
        Relationships: []
      }
      session_bookings: {
        Row: {
          amount_paise: number
          analyst_id: string
          created_at: string
          id: string
          meeting_link: string | null
          notes: string | null
          payment_id: string | null
          scheduled_for: string
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise: number
          analyst_id: string
          created_at?: string
          id?: string
          meeting_link?: string | null
          notes?: string | null
          payment_id?: string | null
          scheduled_for: string
          status?: string
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          analyst_id?: string
          created_at?: string
          id?: string
          meeting_link?: string | null
          notes?: string | null
          payment_id?: string | null
          scheduled_for?: string
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_master: {
        Row: {
          company_name: string | null
          dhan_security_id: string
          exchange: string
          id: string
          isin: string | null
          lot_size: number | null
          segment: string
          symbol: string
          tick_size: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          dhan_security_id: string
          exchange: string
          id?: string
          isin?: string | null
          lot_size?: number | null
          segment: string
          symbol: string
          tick_size?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          dhan_security_id?: string
          exchange?: string
          id?: string
          isin?: string | null
          lot_size?: number | null
          segment?: string
          symbol?: string
          tick_size?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_portfolio: {
        Row: {
          added_from_query_id: string | null
          buy_price: number
          created_at: string
          id: string
          quantity: number
          stock_name: string
          stock_symbol: string
          stop_loss: number | null
          stop_loss_hit_notified: boolean
          target: number | null
          target_hit_notified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          added_from_query_id?: string | null
          buy_price: number
          created_at?: string
          id?: string
          quantity?: number
          stock_name: string
          stock_symbol: string
          stop_loss?: number | null
          stop_loss_hit_notified?: boolean
          target?: number | null
          target_hit_notified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          added_from_query_id?: string | null
          buy_price?: number
          created_at?: string
          id?: string
          quantity?: number
          stock_name?: string
          stock_symbol?: string
          stop_loss?: number | null
          stop_loss_hit_notified?: boolean
          target?: number | null
          target_hit_notified?: boolean
          updated_at?: string
          user_id?: string
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
      analyst_complaints_summary: {
        Row: {
          analyst_id: string | null
          pending_last_30d: number | null
          resolved_all_time: number | null
          resolved_last_30d: number | null
          total_all_time: number | null
          total_last_30d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_demo_credits: { Args: { _amount: number }; Returns: Json }
      admin_adjust_wallet: {
        Args: { _amount: number; _reason: string; _target_user_id: string }
        Returns: Json
      }
      cleanup_ltp_history: { Args: never; Returns: undefined }
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
