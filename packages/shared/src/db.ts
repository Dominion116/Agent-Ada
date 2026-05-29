/**
 * Supabase Database type definition for Agent Ada.
 *
 * Pass this as the generic to createClient<Database>() for fully typed queries.
 * Matches the schema in infra/migrations/001_initial_schema.sql.
 *
 * Re-generate with `supabase gen types typescript` once the project is live.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          self_agent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          self_agent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          self_agent_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      policies: {
        Row: {
          id: string;
          wallet_address: string;
          version: number;
          min_net_gain_bps: number;
          max_route_cost_bps: number;
          cooldown_hours: number;
          allowed_chains: string[];
          allowed_venues: string[];
          kill_switch: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          version?: number;
          min_net_gain_bps?: number;
          max_route_cost_bps?: number;
          cooldown_hours?: number;
          allowed_chains?: string[];
          allowed_venues?: string[];
          kill_switch?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          version?: number;
          min_net_gain_bps?: number;
          max_route_cost_bps?: number;
          cooldown_hours?: number;
          allowed_chains?: string[];
          allowed_venues?: string[];
          kill_switch?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      positions: {
        Row: {
          id: string;
          wallet_address: string;
          chain: string;
          venue: string;
          asset: string;
          amount: number;
          supply_rate_bps: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          chain: string;
          venue: string;
          asset: string;
          amount?: number;
          supply_rate_bps?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          chain?: string;
          venue?: string;
          asset?: string;
          amount?: number;
          supply_rate_bps?: number;
          updated_at?: string;
        };
        Relationships: [];
      };

      quotes: {
        Row: {
          id: string;
          wallet_address: string;
          source_chain: string;
          source_venue: string;
          dest_chain: string;
          dest_venue: string;
          asset: string;
          amount: number;
          route_cost_bps: number;
          net_gain_bps: number;
          payback_days: number;
          policy_version: number;
          approval_token: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          source_chain: string;
          source_venue: string;
          dest_chain: string;
          dest_venue: string;
          asset: string;
          amount: number;
          route_cost_bps: number;
          net_gain_bps: number;
          payback_days: number;
          policy_version: number;
          approval_token: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          source_chain?: string;
          source_venue?: string;
          dest_chain?: string;
          dest_venue?: string;
          asset?: string;
          amount?: number;
          route_cost_bps?: number;
          net_gain_bps?: number;
          payback_days?: number;
          policy_version?: number;
          approval_token?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      runs: {
        Row: {
          id: string;
          wallet_address: string;
          quote_id: string | null;
          mode: "dry_run" | "live";
          status: "pending" | "executing" | "completed" | "failed" | "dry_run_complete";
          tx_hashes: Json;
          policy_version: number;
          outcome: Json | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          quote_id?: string | null;
          mode: "dry_run" | "live";
          status?: "pending" | "executing" | "completed" | "failed" | "dry_run_complete";
          tx_hashes?: Json;
          policy_version: number;
          outcome?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          quote_id?: string | null;
          mode?: "dry_run" | "live";
          status?: "pending" | "executing" | "completed" | "failed" | "dry_run_complete";
          tx_hashes?: Json;
          policy_version?: number;
          outcome?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };

      reports: {
        Row: {
          id: string;
          wallet_address: string;
          period: string;
          summary_json: Json;
          generated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          period: string;
          summary_json?: Json;
          generated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          period?: string;
          summary_json?: Json;
          generated_at?: string;
        };
        Relationships: [];
      };

      chats: {
        Row: {
          id: string;
          wallet_address: string;
          role: "user" | "assistant";
          content: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          role: "user" | "assistant";
          content: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          role?: "user" | "assistant";
          content?: string;
          payload?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      telegram_configs: {
        Row: {
          id: string;
          wallet_address: string;
          bot_token_ciphertext: string;
          chat_id: string;
          events: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          bot_token_ciphertext: string;
          chat_id: string;
          events?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          bot_token_ciphertext?: string;
          chat_id?: string;
          events?: string[];
          created_at?: string;
        };
        Relationships: [];
      };

      api_calls: {
        Row: {
          id: string;
          caller_agent_id: string | null;
          endpoint: string;
          x402_invoice: string | null;
          settled_tx: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          caller_agent_id?: string | null;
          endpoint: string;
          x402_invoice?: string | null;
          settled_tx?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          caller_agent_id?: string | null;
          endpoint?: string;
          x402_invoice?: string | null;
          settled_tx?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      latest_policy: {
        Args: { p_wallet: string };
        Returns: Database["public"]["Tables"]["policies"]["Row"] | null;
      };
      upsert_position: {
        Args: {
          p_wallet: string;
          p_chain: string;
          p_venue: string;
          p_asset: string;
          p_amount: number;
          p_rate_bps: number;
        };
        Returns: Database["public"]["Tables"]["positions"]["Row"];
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
