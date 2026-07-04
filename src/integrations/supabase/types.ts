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
      ai_followups: {
        Row: {
          analyst_id: string | null
          content: string
          conversation_mode: string
          created_at: string
          id: string
          ip_address: unknown
          llm_cost_usd: number | null
          llm_input_tokens: number | null
          llm_model: string | null
          llm_output_tokens: number | null
          llm_provider: string | null
          parent_followup_id: string | null
          query_id: string | null
          role: string
          route_decision: string | null
          routed_query_id: string | null
          sources_used: Json
          thread_id: string
          user_id: string
        }
        Insert: {
          analyst_id?: string | null
          content: string
          conversation_mode: string
          created_at?: string
          id?: string
          ip_address?: unknown
          llm_cost_usd?: number | null
          llm_input_tokens?: number | null
          llm_model?: string | null
          llm_output_tokens?: number | null
          llm_provider?: string | null
          parent_followup_id?: string | null
          query_id?: string | null
          role: string
          route_decision?: string | null
          routed_query_id?: string | null
          sources_used?: Json
          thread_id: string
          user_id: string
        }
        Update: {
          analyst_id?: string | null
          content?: string
          conversation_mode?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          llm_cost_usd?: number | null
          llm_input_tokens?: number | null
          llm_model?: string | null
          llm_output_tokens?: number | null
          llm_provider?: string | null
          parent_followup_id?: string | null
          query_id?: string | null
          role?: string
          route_decision?: string | null
          routed_query_id?: string | null
          sources_used?: Json
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_followups_parent_followup_id_fkey"
            columns: ["parent_followup_id"]
            isOneToOne: false
            referencedRelation: "ai_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_followups_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_followups_routed_query_id_fkey"
            columns: ["routed_query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
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
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          event_props: Json
          id: string
          ip_hash: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          event_props?: Json
          id?: string
          ip_hash?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          event_props?: Json
          id?: string
          ip_hash?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
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
      backtest_results: {
        Row: {
          created_at: string
          days_to_entry_hit: number | null
          days_to_t1: number | null
          days_to_t2: number | null
          engine_version: string
          entry_anchor: string | null
          entry_date: string
          entry_hit: boolean | null
          entry_zone_lower: number | null
          entry_zone_upper: number | null
          error_detail: string | null
          horizon: string
          id: string
          outcome: string
          preferred_entry: number | null
          reasoning_code: string | null
          regime: string | null
          run_id: string
          sl_hit_first: boolean | null
          stop_loss: number | null
          symbol: string
          t1_hit: boolean | null
          t2_hit: boolean | null
          target_1: number | null
          target_2: number | null
        }
        Insert: {
          created_at?: string
          days_to_entry_hit?: number | null
          days_to_t1?: number | null
          days_to_t2?: number | null
          engine_version: string
          entry_anchor?: string | null
          entry_date: string
          entry_hit?: boolean | null
          entry_zone_lower?: number | null
          entry_zone_upper?: number | null
          error_detail?: string | null
          horizon: string
          id?: string
          outcome?: string
          preferred_entry?: number | null
          reasoning_code?: string | null
          regime?: string | null
          run_id: string
          sl_hit_first?: boolean | null
          stop_loss?: number | null
          symbol: string
          t1_hit?: boolean | null
          t2_hit?: boolean | null
          target_1?: number | null
          target_2?: number | null
        }
        Update: {
          created_at?: string
          days_to_entry_hit?: number | null
          days_to_t1?: number | null
          days_to_t2?: number | null
          engine_version?: string
          entry_anchor?: string | null
          entry_date?: string
          entry_hit?: boolean | null
          entry_zone_lower?: number | null
          entry_zone_upper?: number | null
          error_detail?: string | null
          horizon?: string
          id?: string
          outcome?: string
          preferred_entry?: number | null
          reasoning_code?: string | null
          regime?: string | null
          run_id?: string
          sl_hit_first?: boolean | null
          stop_loss?: number | null
          symbol?: string
          t1_hit?: boolean | null
          t2_hit?: boolean | null
          target_1?: number | null
          target_2?: number | null
        }
        Relationships: []
      }
      backtest_run_summary: {
        Row: {
          breakdown_by_horizon: Json | null
          breakdown_by_reasoning_code: Json | null
          breakdown_by_regime: Json | null
          completed_cases: number
          config: Json | null
          data_error_cases: number
          engine_version: string
          entry_hit_rate: number | null
          error_message: string | null
          finished_at: string | null
          last_progress_at: string | null
          next_chunk_index: number
          run_id: string
          sl_hit_rate: number | null
          started_at: string
          status: string
          t1_hit_rate: number | null
          t2_hit_rate: number | null
          timeout_rate: number | null
          total_cases: number
          universe_size: number
        }
        Insert: {
          breakdown_by_horizon?: Json | null
          breakdown_by_reasoning_code?: Json | null
          breakdown_by_regime?: Json | null
          completed_cases?: number
          config?: Json | null
          data_error_cases?: number
          engine_version: string
          entry_hit_rate?: number | null
          error_message?: string | null
          finished_at?: string | null
          last_progress_at?: string | null
          next_chunk_index?: number
          run_id: string
          sl_hit_rate?: number | null
          started_at?: string
          status?: string
          t1_hit_rate?: number | null
          t2_hit_rate?: number | null
          timeout_rate?: number | null
          total_cases?: number
          universe_size?: number
        }
        Update: {
          breakdown_by_horizon?: Json | null
          breakdown_by_reasoning_code?: Json | null
          breakdown_by_regime?: Json | null
          completed_cases?: number
          config?: Json | null
          data_error_cases?: number
          engine_version?: string
          entry_hit_rate?: number | null
          error_message?: string | null
          finished_at?: string | null
          last_progress_at?: string | null
          next_chunk_index?: number
          run_id?: string
          sl_hit_rate?: number | null
          started_at?: string
          status?: string
          t1_hit_rate?: number | null
          t2_hit_rate?: number | null
          timeout_rate?: number | null
          total_cases?: number
          universe_size?: number
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
          batch_id: string | null
          created_at: string
          error_message: string | null
          finished_at: string
          function_name: string
          id: number
          metrics: Json | null
          mode: string | null
          started_at: string
          status: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at: string
          function_name: string
          id?: number
          metrics?: Json | null
          mode?: string | null
          started_at: string
          status: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string
          function_name?: string
          id?: number
          metrics?: Json | null
          mode?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      fundamentals_cache: {
        Row: {
          as_of: string | null
          cap_band: string | null
          exchange: string
          industry: string | null
          market_cap_rs: number | null
          sector: string | null
          source: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          as_of?: string | null
          cap_band?: string | null
          exchange?: string
          industry?: string | null
          market_cap_rs?: number | null
          sector?: string | null
          source?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          as_of?: string | null
          cap_band?: string | null
          exchange?: string
          industry?: string | null
          market_cap_rs?: number | null
          sector?: string | null
          source?: string | null
          symbol?: string
          updated_at?: string
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
      library_consent_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          query_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          query_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          query_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_consent_events_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
      library_item_views: {
        Row: {
          created_at: string
          id: number
          item_id: string
          viewer_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          item_id: string
          viewer_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          item_id?: string
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_item_views_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          analyst_id: string | null
          body_excerpt: string | null
          created_at: string
          id: string
          is_public: boolean
          is_tombstoned: boolean
          kind: string
          published_at: string | null
          search_tsv: unknown
          sector: string | null
          source_id: string
          source_table: string
          symbol: string | null
          symbol_exchange: string | null
          title: string
          trgm_blob: string | null
          updated_at: string
          verdict: string | null
          view_count: number
        }
        Insert: {
          analyst_id?: string | null
          body_excerpt?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          is_tombstoned?: boolean
          kind: string
          published_at?: string | null
          search_tsv?: unknown
          sector?: string | null
          source_id: string
          source_table: string
          symbol?: string | null
          symbol_exchange?: string | null
          title: string
          trgm_blob?: string | null
          updated_at?: string
          verdict?: string | null
          view_count?: number
        }
        Update: {
          analyst_id?: string | null
          body_excerpt?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          is_tombstoned?: boolean
          kind?: string
          published_at?: string | null
          search_tsv?: unknown
          sector?: string | null
          source_id?: string
          source_table?: string
          symbol?: string | null
          symbol_exchange?: string | null
          title?: string
          trgm_blob?: string | null
          updated_at?: string
          verdict?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_items_analyst_id_fkey"
            columns: ["analyst_id"]
            isOneToOne: false
            referencedRelation: "analyst_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_search_logs: {
        Row: {
          clicked_item_id: string | null
          created_at: string
          id: number
          normalized_query: string | null
          query_text: string
          result_count: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          clicked_item_id?: string | null
          created_at?: string
          id?: number
          normalized_query?: string | null
          query_text: string
          result_count?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_item_id?: string | null
          created_at?: string
          id?: number
          normalized_query?: string | null
          query_text?: string
          result_count?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_search_logs_clicked_item_id_fkey"
            columns: ["clicked_item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ltp_cache: {
        Row: {
          as_of: string | null
          exchange: string
          fetched_at: string
          ltp: number
          source: string
          symbol: string
          updated_at: string
        }
        Insert: {
          as_of?: string | null
          exchange?: string
          fetched_at?: string
          ltp: number
          source?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          as_of?: string | null
          exchange?: string
          fetched_at?: string
          ltp?: number
          source?: string
          symbol?: string
          updated_at?: string
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
      news_cache: {
        Row: {
          category: string | null
          exchange: string | null
          headline: string
          id: number
          inserted_at: string
          published_at: string
          source: string | null
          symbol: string
          url: string | null
        }
        Insert: {
          category?: string | null
          exchange?: string | null
          headline: string
          id?: number
          inserted_at?: string
          published_at: string
          source?: string | null
          symbol: string
          url?: string | null
        }
        Update: {
          category?: string | null
          exchange?: string | null
          headline?: string
          id?: number
          inserted_at?: string
          published_at?: string
          source?: string | null
          symbol?: string
          url?: string | null
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
      points_expiry_log: {
        Row: {
          expired_at: string
          id: string
          points_expired: number
          reason: string
          source_entry_id: string | null
          user_id: string
        }
        Insert: {
          expired_at?: string
          id?: string
          points_expired: number
          reason: string
          source_entry_id?: string | null
          user_id: string
        }
        Update: {
          expired_at?: string
          id?: string
          points_expired?: number
          reason?: string
          source_entry_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_expiry_log_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "wallet_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          founder_beta: boolean
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
          founder_beta?: boolean
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
          founder_beta?: boolean
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
          addendum_used: string | null
          ai_report: Json | null
          assigned_analyst_id: string | null
          buy_price: number | null
          concept_canonical: string | null
          created_at: string | null
          current_price: number | null
          custom_question: string | null
          educational_difficulty: string | null
          engine_source: string | null
          engine_version: string | null
          entry_price: number | null
          frozen_at: string | null
          horizon: string | null
          id: string
          intent: string | null
          is_public_library: boolean
          library_tombstoned_at: string | null
          mixed_query_meta: Json | null
          orchestrator_response_id: string | null
          pnl_state: string | null
          position_state: string | null
          profit_loss_pct: number | null
          public_consent_anonymized: boolean
          public_consent_at: string | null
          qty: number | null
          query_text: string
          query_type: string | null
          regenerated_from_uuid: string | null
          report_artifact_status: string | null
          router_meta: Json | null
          secondary_answers: Json | null
          secondary_asks: Json | null
          sector_canonical: string | null
          sector_macro_state: string | null
          status: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol: string | null
          updated_at: string | null
          user_id: string
          video_payment_id: string | null
          video_requested: boolean
        }
        Insert: {
          addendum_used?: string | null
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          concept_canonical?: string | null
          created_at?: string | null
          current_price?: number | null
          custom_question?: string | null
          educational_difficulty?: string | null
          engine_source?: string | null
          engine_version?: string | null
          entry_price?: number | null
          frozen_at?: string | null
          horizon?: string | null
          id?: string
          intent?: string | null
          is_public_library?: boolean
          library_tombstoned_at?: string | null
          mixed_query_meta?: Json | null
          orchestrator_response_id?: string | null
          pnl_state?: string | null
          position_state?: string | null
          profit_loss_pct?: number | null
          public_consent_anonymized?: boolean
          public_consent_at?: string | null
          qty?: number | null
          query_text: string
          query_type?: string | null
          regenerated_from_uuid?: string | null
          report_artifact_status?: string | null
          router_meta?: Json | null
          secondary_answers?: Json | null
          secondary_asks?: Json | null
          sector_canonical?: string | null
          sector_macro_state?: string | null
          status?: Database["public"]["Enums"]["query_status"] | null
          stock_name: string
          stock_symbol?: string | null
          updated_at?: string | null
          user_id: string
          video_payment_id?: string | null
          video_requested?: boolean
        }
        Update: {
          addendum_used?: string | null
          ai_report?: Json | null
          assigned_analyst_id?: string | null
          buy_price?: number | null
          concept_canonical?: string | null
          created_at?: string | null
          current_price?: number | null
          custom_question?: string | null
          educational_difficulty?: string | null
          engine_source?: string | null
          engine_version?: string | null
          entry_price?: number | null
          frozen_at?: string | null
          horizon?: string | null
          id?: string
          intent?: string | null
          is_public_library?: boolean
          library_tombstoned_at?: string | null
          mixed_query_meta?: Json | null
          orchestrator_response_id?: string | null
          pnl_state?: string | null
          position_state?: string | null
          profit_loss_pct?: number | null
          public_consent_anonymized?: boolean
          public_consent_at?: string | null
          qty?: number | null
          query_text?: string
          query_type?: string | null
          regenerated_from_uuid?: string | null
          report_artifact_status?: string | null
          router_meta?: Json | null
          secondary_answers?: Json | null
          secondary_asks?: Json | null
          sector_canonical?: string | null
          sector_macro_state?: string | null
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
      stock_index_membership: {
        Row: {
          as_of_date: string
          created_at: string
          exchange: string
          id: number
          index_name: string
          source: string | null
          symbol: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          exchange: string
          id?: number
          index_name: string
          source?: string | null
          symbol: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          exchange?: string
          id?: number
          index_name?: string
          source?: string | null
          symbol?: string
        }
        Relationships: []
      }
      stock_master: {
        Row: {
          alternate_listings: Json | null
          cap_band: string | null
          company_name: string | null
          dhan_security_id: string
          exchange: string
          id: string
          industry: string | null
          is_asm: boolean | null
          is_gsm: boolean | null
          is_suspended: boolean | null
          is_t2t: boolean | null
          isin: string | null
          lot_size: number | null
          market_cap_rs: number | null
          pledged_pct: number | null
          sector: string | null
          sector_canonical: string | null
          seed_version: string | null
          segment: string
          shares_outstanding: number | null
          symbol: string
          tick_size: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          alternate_listings?: Json | null
          cap_band?: string | null
          company_name?: string | null
          dhan_security_id: string
          exchange: string
          id?: string
          industry?: string | null
          is_asm?: boolean | null
          is_gsm?: boolean | null
          is_suspended?: boolean | null
          is_t2t?: boolean | null
          isin?: string | null
          lot_size?: number | null
          market_cap_rs?: number | null
          pledged_pct?: number | null
          sector?: string | null
          sector_canonical?: string | null
          seed_version?: string | null
          segment: string
          shares_outstanding?: number | null
          symbol: string
          tick_size?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          alternate_listings?: Json | null
          cap_band?: string | null
          company_name?: string | null
          dhan_security_id?: string
          exchange?: string
          id?: string
          industry?: string | null
          is_asm?: boolean | null
          is_gsm?: boolean | null
          is_suspended?: boolean | null
          is_t2t?: boolean | null
          isin?: string | null
          lot_size?: number | null
          market_cap_rs?: number | null
          pledged_pct?: number | null
          sector?: string | null
          sector_canonical?: string | null
          seed_version?: string | null
          segment?: string
          shares_outstanding?: number | null
          symbol?: string
          tick_size?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_picker_backtest_run: {
        Row: {
          avg_return_pct: number | null
          composite_score_preview_avg: number | null
          created_at: string
          exchange: string
          hit_rate: number | null
          id: string
          information_coefficient: number | null
          max_drawdown_pct: number | null
          median_return_pct: number | null
          n_losses: number
          n_signals: number
          n_wins: number
          risk_profile: string
          run_id: string
          symbol: string
          window_end: string
          window_start: string
        }
        Insert: {
          avg_return_pct?: number | null
          composite_score_preview_avg?: number | null
          created_at?: string
          exchange: string
          hit_rate?: number | null
          id?: string
          information_coefficient?: number | null
          max_drawdown_pct?: number | null
          median_return_pct?: number | null
          n_losses: number
          n_signals: number
          n_wins: number
          risk_profile: string
          run_id: string
          symbol: string
          window_end: string
          window_start: string
        }
        Update: {
          avg_return_pct?: number | null
          composite_score_preview_avg?: number | null
          created_at?: string
          exchange?: string
          hit_rate?: number | null
          id?: string
          information_coefficient?: number | null
          max_drawdown_pct?: number | null
          median_return_pct?: number | null
          n_losses?: number
          n_signals?: number
          n_wins?: number
          risk_profile?: string
          run_id?: string
          symbol?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      stock_picker_backtest_sweep: {
        Row: {
          avg_return_pct: number | null
          created_at: string
          hit_rate: number | null
          id: string
          knob_set: Json
          max_drawdown_pct: number | null
          median_return_pct: number | null
          risk_adjusted_score: number | null
          risk_profile: string
          sweep_id: string
          symbols_evaluated: number
          total_trades: number
          variant_id: number
        }
        Insert: {
          avg_return_pct?: number | null
          created_at?: string
          hit_rate?: number | null
          id?: string
          knob_set: Json
          max_drawdown_pct?: number | null
          median_return_pct?: number | null
          risk_adjusted_score?: number | null
          risk_profile: string
          sweep_id: string
          symbols_evaluated: number
          total_trades: number
          variant_id: number
        }
        Update: {
          avg_return_pct?: number | null
          created_at?: string
          hit_rate?: number | null
          id?: string
          knob_set?: Json
          max_drawdown_pct?: number | null
          median_return_pct?: number | null
          risk_adjusted_score?: number | null
          risk_profile?: string
          sweep_id?: string
          symbols_evaluated?: number
          total_trades?: number
          variant_id?: number
        }
        Relationships: []
      }
      stock_picker_batch_rejection: {
        Row: {
          batch_id: string
          batch_state: string
          batch_type: string
          code_commit_sha: string
          created_at: string
          data_gaps_at_generation: Json | null
          id: number
          insufficient_count: number
          insufficient_data_symbols: Json | null
          legal_name: string
          near_miss_symbols: Json | null
          picks_issued_count: number
          reg_no: string
          regulatory_status_at_generation: string
          rejected_count: number
          rejected_symbols: Json | null
          replay_payload_hash: string | null
          replay_payload_hash_version: string
          run_at: string
          total_universe_count: number
          universe_snapshot_id: string
        }
        Insert: {
          batch_id: string
          batch_state: string
          batch_type: string
          code_commit_sha: string
          created_at?: string
          data_gaps_at_generation?: Json | null
          id?: number
          insufficient_count: number
          insufficient_data_symbols?: Json | null
          legal_name: string
          near_miss_symbols?: Json | null
          picks_issued_count: number
          reg_no: string
          regulatory_status_at_generation: string
          rejected_count: number
          rejected_symbols?: Json | null
          replay_payload_hash?: string | null
          replay_payload_hash_version: string
          run_at: string
          total_universe_count: number
          universe_snapshot_id: string
        }
        Update: {
          batch_id?: string
          batch_state?: string
          batch_type?: string
          code_commit_sha?: string
          created_at?: string
          data_gaps_at_generation?: Json | null
          id?: number
          insufficient_count?: number
          insufficient_data_symbols?: Json | null
          legal_name?: string
          near_miss_symbols?: Json | null
          picks_issued_count?: number
          reg_no?: string
          regulatory_status_at_generation?: string
          rejected_count?: number
          rejected_symbols?: Json | null
          replay_payload_hash?: string | null
          replay_payload_hash_version?: string
          run_at?: string
          total_universe_count?: number
          universe_snapshot_id?: string
        }
        Relationships: []
      }
      stock_picker_liquidity_20d: {
        Row: {
          adt_20d_rs: number | null
          adv_20d: number | null
          close: number
          created_at: string
          data_snapshot_at: string
          exchange: string
          fetch_status: string
          id: number
          record_date: string
          source_response_hash: string | null
          symbol: string
          turnover_rs: number
          volume: number
        }
        Insert: {
          adt_20d_rs?: number | null
          adv_20d?: number | null
          close: number
          created_at?: string
          data_snapshot_at: string
          exchange: string
          fetch_status: string
          id?: number
          record_date: string
          source_response_hash?: string | null
          symbol: string
          turnover_rs: number
          volume: number
        }
        Update: {
          adt_20d_rs?: number | null
          adv_20d?: number | null
          close?: number
          created_at?: string
          data_snapshot_at?: string
          exchange?: string
          fetch_status?: string
          id?: number
          record_date?: string
          source_response_hash?: string | null
          symbol?: string
          turnover_rs?: number
          volume?: number
        }
        Relationships: []
      }
      stock_picker_ohlcv_backfill_state: {
        Row: {
          attempted_at: string | null
          created_at: string
          exchange: string
          last_error: string | null
          rows_inserted: number
          source: string | null
          status: string
          symbol: string
          updated_at: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          exchange: string
          last_error?: string | null
          rows_inserted?: number
          source?: string | null
          status: string
          symbol: string
          updated_at?: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          exchange?: string
          last_error?: string | null
          rows_inserted?: number
          source?: string | null
          status?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_picker_ohlcv_history: {
        Row: {
          close: number | null
          exchange: string
          high: number | null
          inserted_at: string
          low: number | null
          open: number | null
          record_date: string
          source: string
          symbol: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          exchange: string
          high?: number | null
          inserted_at?: string
          low?: number | null
          open?: number | null
          record_date: string
          source: string
          symbol: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          exchange?: string
          high?: number | null
          inserted_at?: string
          low?: number | null
          open?: number | null
          record_date?: string
          source?: string
          symbol?: string
          volume?: number | null
        }
        Relationships: []
      }
      stock_picker_pick_audit: {
        Row: {
          batch_id: string
          batch_type: string
          code_commit_sha: string
          composite_score: number | null
          created_at: string
          data_gaps_at_generation: Json | null
          exchange: string
          generated_at: string
          id: number
          legal_name: string
          pillar_scores: Json | null
          reg_no: string
          regulatory_status_at_generation: string
          replay_payload_hash: string | null
          replay_payload_hash_version: string
          symbol: string
          universe_snapshot_id: string
          verdict: string
        }
        Insert: {
          batch_id: string
          batch_type: string
          code_commit_sha: string
          composite_score?: number | null
          created_at?: string
          data_gaps_at_generation?: Json | null
          exchange: string
          generated_at: string
          id?: number
          legal_name: string
          pillar_scores?: Json | null
          reg_no: string
          regulatory_status_at_generation: string
          replay_payload_hash?: string | null
          replay_payload_hash_version: string
          symbol: string
          universe_snapshot_id: string
          verdict: string
        }
        Update: {
          batch_id?: string
          batch_type?: string
          code_commit_sha?: string
          composite_score?: number | null
          created_at?: string
          data_gaps_at_generation?: Json | null
          exchange?: string
          generated_at?: string
          id?: number
          legal_name?: string
          pillar_scores?: Json | null
          reg_no?: string
          regulatory_status_at_generation?: string
          replay_payload_hash?: string | null
          replay_payload_hash_version?: string
          symbol?: string
          universe_snapshot_id?: string
          verdict?: string
        }
        Relationships: []
      }
      stock_picker_runtime_config: {
        Row: {
          config_key: string
          config_value: Json
          description: string | null
          kind: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: Json
          description?: string | null
          kind: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: Json
          description?: string | null
          kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_picker_trading_calendar: {
        Row: {
          calendar_date: string
          created_at: string
          description: string | null
          is_trading_day: boolean
        }
        Insert: {
          calendar_date: string
          created_at?: string
          description?: string | null
          is_trading_day?: boolean
        }
        Update: {
          calendar_date?: string
          created_at?: string
          description?: string | null
          is_trading_day?: boolean
        }
        Relationships: []
      }
      stock_picker_universe_snapshot: {
        Row: {
          code_commit_sha: string
          created_at: string
          id: string
          invoked_by: string
          run_date_ist: string
          seed_source_doc_sha: string
          seed_version: string
          universe_size: number
          universe_snapshot_hash: string
        }
        Insert: {
          code_commit_sha: string
          created_at?: string
          id?: string
          invoked_by: string
          run_date_ist: string
          seed_source_doc_sha: string
          seed_version: string
          universe_size: number
          universe_snapshot_hash: string
        }
        Update: {
          code_commit_sha?: string
          created_at?: string
          id?: string
          invoked_by?: string
          run_date_ist?: string
          seed_source_doc_sha?: string
          seed_version?: string
          universe_size?: number
          universe_snapshot_hash?: string
        }
        Relationships: []
      }
      stock_picker_universe_snapshot_member: {
        Row: {
          alternate_listings: Json | null
          canonical_rank: number
          created_at: string
          dhan_security_id: string | null
          exchange: string
          id: number
          isin: string | null
          sector_canonical: string | null
          segment: string
          successor_applied: boolean | null
          symbol: string
          universe_snapshot_id: string
        }
        Insert: {
          alternate_listings?: Json | null
          canonical_rank: number
          created_at?: string
          dhan_security_id?: string | null
          exchange: string
          id?: number
          isin?: string | null
          sector_canonical?: string | null
          segment: string
          successor_applied?: boolean | null
          symbol: string
          universe_snapshot_id: string
        }
        Update: {
          alternate_listings?: Json | null
          canonical_rank?: number
          created_at?: string
          dhan_security_id?: string | null
          exchange?: string
          id?: number
          isin?: string | null
          sector_canonical?: string | null
          segment?: string
          successor_applied?: boolean | null
          symbol?: string
          universe_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_picker_universe_snapshot_member_universe_snapshot_id_fkey"
            columns: ["universe_snapshot_id"]
            isOneToOne: false
            referencedRelation: "stock_picker_universe_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_inr: number
          created_at: string
          display_name: string
          free_live_count: number
          free_video_count: number
          id: string
          is_active: boolean
          monthly_inr: number
          monthly_points: number
          perks: Json
          rollover_cap_points: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_inr: number
          created_at?: string
          display_name: string
          free_live_count?: number
          free_video_count?: number
          id: string
          is_active?: boolean
          monthly_inr: number
          monthly_points: number
          perks?: Json
          rollover_cap_points: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_inr?: number
          created_at?: string
          display_name?: string
          free_live_count?: number
          free_video_count?: number
          id?: string
          is_active?: boolean
          monthly_inr?: number
          monthly_points?: number
          perks?: Json
          rollover_cap_points?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      symbol_aliases: {
        Row: {
          alias: string
          canonical_symbol: string
          notes: string | null
        }
        Insert: {
          alias: string
          canonical_symbol: string
          notes?: string | null
        }
        Update: {
          alias?: string
          canonical_symbol?: string
          notes?: string | null
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
      user_subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          razorpay_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          plan_id: string
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_debit_failures: {
        Row: {
          action_key: string
          assistant_row_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          points_attempted: number
          query_id: string | null
          rpc_payload: Json | null
          rpc_status: string
          user_id: string
        }
        Insert: {
          action_key: string
          assistant_row_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          points_attempted: number
          query_id?: string | null
          rpc_payload?: Json | null
          rpc_status: string
          user_id: string
        }
        Update: {
          action_key?: string
          assistant_row_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          points_attempted?: number
          query_id?: string | null
          rpc_payload?: Json | null
          rpc_status?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          created_at: string
          entry_type: string
          expiry_at: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          query_id: string | null
          query_type: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_type: string
          expiry_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          query_id?: string | null
          query_type?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_type?: string
          expiry_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          query_id?: string | null
          query_type?: string | null
          source?: string | null
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
      stock_picker_liquidity_20d_latest: {
        Row: {
          adt_20d_rs: number | null
          adv_20d: number | null
          close: number | null
          created_at: string | null
          data_snapshot_at: string | null
          exchange: string | null
          fetch_status: string | null
          id: number | null
          record_date: string | null
          source_response_hash: string | null
          symbol: string | null
          turnover_rs: number | null
          volume: number | null
        }
        Relationships: []
      }
      v_ai_followup_usage_daily: {
        Row: {
          conversation_mode: string | null
          cost_usd: number | null
          day: string | null
          input_tokens: number | null
          llm_provider: string | null
          msg_count: number | null
          output_tokens: number | null
        }
        Relationships: []
      }
      wallet_balances: {
        Row: {
          balance: number | null
          last_ledger_at: string | null
          user_id: string | null
          welcome_bonus_expires_at: string | null
          welcome_bonus_remaining: number | null
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
      credit_wallet_topup: {
        Args: {
          p_idempotency_key: string
          p_metadata?: Json
          p_points: number
          p_source: string
          p_user_id: string
        }
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
      expire_welcome_bonus: { Args: { p_user_id: string }; Returns: Json }
      fn_aggregate_library_views: { Args: never; Returns: undefined }
      fn_has_pii_hint: { Args: { p_text: string }; Returns: boolean }
      fn_library_search: {
        Args: { limit_n?: number; q: string }
        Returns: {
          analyst_id: string
          analyst_name: string
          analyst_sebi_reg_number: string
          body_excerpt: string
          id: string
          is_tombstoned: boolean
          kind: string
          published_at: string
          rank: number
          related_query_id: string
          sector: string
          source_id: string
          source_table: string
          symbol: string
          symbol_exchange: string
          title: string
          verdict: string
          view_count: number
        }[]
      }
      fn_normalize_symbol: { Args: { raw: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      grant_first_topup_bonus: {
        Args: { p_topup_amount_inr: number; p_user_id: string }
        Returns: Json
      }
      grant_welcome_bonus: {
        Args: { p_phone: string; p_user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stock_picker_write_audit_row: {
        Args: {
          p_batch_id: string
          p_batch_type: string
          p_code_commit_sha: string
          p_composite_score: number
          p_data_gaps_at_generation: string
          p_exchange: string
          p_generated_at: string
          p_legal_name: string
          p_pillar_scores: string
          p_reg_no: string
          p_regulatory_status_at_generation: string
          p_replay_payload_hash: string
          p_replay_payload_hash_version: string
          p_symbol: string
          p_universe_snapshot_id: string
          p_verdict: string
        }
        Returns: string
      }
      stock_picker_write_batch_rejection_row: {
        Args: {
          p_batch_id: string
          p_batch_state: string
          p_batch_type: string
          p_code_commit_sha: string
          p_data_gaps_at_generation: string
          p_insufficient_count: number
          p_insufficient_data_symbols: string
          p_legal_name: string
          p_near_miss_symbols: string
          p_picks_issued_count: number
          p_reg_no: string
          p_regulatory_status_at_generation: string
          p_rejected_count: number
          p_rejected_symbols: string
          p_replay_payload_hash: string
          p_replay_payload_hash_version: string
          p_run_at: string
          p_total_universe_count: number
          p_universe_snapshot_id: string
        }
        Returns: string
      }
      wallet_apply_debit: {
        Args: {
          p_action_key: string
          p_idempotency_key?: string
          p_points: number
          p_query_id?: string
          p_user_id: string
        }
        Returns: Json
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
