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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      carrier_rates: {
        Row: {
          adv_min: number | null
          adv_pct_nf: number | null
          cidade_corrigida: string
          emex_min: number | null
          emex_pct_nf: number | null
          faixa_10: number | null
          faixa_100: number | null
          faixa_150: number | null
          faixa_20: number | null
          faixa_200: number | null
          faixa_30: number | null
          faixa_50: number | null
          faixa_70: number | null
          frete_kg_ex_200: number | null
          gris_min: number | null
          gris_pct_nf: number | null
          id: string
          pedagio_fr_100kg: number | null
          sec_cat: number | null
          sefaz: number | null
          study_id: string
          tas: number | null
          tce_min: number | null
          tda_min: number | null
          tda_pct_fr: number | null
          tde_min: number | null
          tde_pct_fr: number | null
          tde_por_kg: number | null
          trt_min: number | null
          trt_pct_fr: number | null
          tso_min: number | null
          tso_pct: number | null
          uf: string
        }
        Insert: {
          adv_min?: number | null
          adv_pct_nf?: number | null
          cidade_corrigida: string
          emex_min?: number | null
          emex_pct_nf?: number | null
          faixa_10?: number | null
          faixa_100?: number | null
          faixa_150?: number | null
          faixa_20?: number | null
          faixa_200?: number | null
          faixa_30?: number | null
          faixa_50?: number | null
          faixa_70?: number | null
          frete_kg_ex_200?: number | null
          gris_min?: number | null
          gris_pct_nf?: number | null
          id?: string
          pedagio_fr_100kg?: number | null
          sec_cat?: number | null
          sefaz?: number | null
          study_id: string
          tas?: number | null
          tce_min?: number | null
          tda_min?: number | null
          tda_pct_fr?: number | null
          tde_min?: number | null
          tde_pct_fr?: number | null
          tde_por_kg?: number | null
          trt_min?: number | null
          trt_pct_fr?: number | null
          tso_min?: number | null
          tso_pct?: number | null
          uf: string
        }
        Update: {
          adv_min?: number | null
          adv_pct_nf?: number | null
          cidade_corrigida?: string
          emex_min?: number | null
          emex_pct_nf?: number | null
          faixa_10?: number | null
          faixa_100?: number | null
          faixa_150?: number | null
          faixa_20?: number | null
          faixa_200?: number | null
          faixa_30?: number | null
          faixa_50?: number | null
          faixa_70?: number | null
          frete_kg_ex_200?: number | null
          gris_min?: number | null
          gris_pct_nf?: number | null
          id?: string
          pedagio_fr_100kg?: number | null
          sec_cat?: number | null
          sefaz?: number | null
          study_id?: string
          tas?: number | null
          tce_min?: number | null
          tda_min?: number | null
          tda_pct_fr?: number | null
          tde_min?: number | null
          tde_pct_fr?: number | null
          tde_por_kg?: number | null
          trt_min?: number | null
          trt_pct_fr?: number | null
          tso_min?: number | null
          tso_pct?: number | null
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rates_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      icms_uf: {
        Row: {
          aliquota: number
          uf: string
          updated_at: string
        }
        Insert: {
          aliquota?: number
          uf: string
          updated_at?: string
        }
        Update: {
          aliquota?: number
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipments_paid: {
        Row: {
          cidade_corrigida: string
          data: string | null
          id: string
          peso: number
          servico: string | null
          shipment_id: string
          study_id: string
          transportadora_atual: string | null
          uf: string
          valor_cobrado: number
          valor_nf: number
        }
        Insert: {
          cidade_corrigida: string
          data?: string | null
          id?: string
          peso: number
          servico?: string | null
          shipment_id: string
          study_id: string
          transportadora_atual?: string | null
          uf: string
          valor_cobrado: number
          valor_nf: number
        }
        Update: {
          cidade_corrigida?: string
          data?: string | null
          id?: string
          peso?: number
          servico?: string | null
          shipment_id?: string
          study_id?: string
          transportadora_atual?: string | null
          uf?: string
          valor_cobrado?: number
          valor_nf?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipments_paid_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          adm_rodo_tax: number | null
          adv: number | null
          diferenca_valor: number | null
          emex: number | null
          errors: string | null
          frete_base_peso: number | null
          frete_c_icms: number | null
          frete_final: number | null
          frete_peso: number | null
          gris: number | null
          id: string
          match_status: string
          pct_dif: number | null
          pedagio: number | null
          rate_row_id: string | null
          reais_kg_hj: number | null
          reais_kg_proposta: number | null
          sec_tas: number | null
          sefaz: number | null
          shipment_row_id: string
          study_id: string
          tda: number | null
          trt_calc: number | null
          tso: number | null
          tx_redespacho: number | null
          valor_cobrado: number | null
        }
        Insert: {
          adm_rodo_tax?: number | null
          adv?: number | null
          diferenca_valor?: number | null
          emex?: number | null
          errors?: string | null
          frete_base_peso?: number | null
          frete_c_icms?: number | null
          frete_final?: number | null
          frete_peso?: number | null
          gris?: number | null
          id?: string
          match_status?: string
          pct_dif?: number | null
          pedagio?: number | null
          rate_row_id?: string | null
          reais_kg_hj?: number | null
          reais_kg_proposta?: number | null
          sec_tas?: number | null
          sefaz?: number | null
          shipment_row_id: string
          study_id: string
          tda?: number | null
          trt_calc?: number | null
          tso?: number | null
          tx_redespacho?: number | null
          valor_cobrado?: number | null
        }
        Update: {
          adm_rodo_tax?: number | null
          adv?: number | null
          diferenca_valor?: number | null
          emex?: number | null
          errors?: string | null
          frete_base_peso?: number | null
          frete_c_icms?: number | null
          frete_final?: number | null
          frete_peso?: number | null
          gris?: number | null
          id?: string
          match_status?: string
          pct_dif?: number | null
          pedagio?: number | null
          rate_row_id?: string | null
          reais_kg_hj?: number | null
          reais_kg_proposta?: number | null
          sec_tas?: number | null
          sefaz?: number | null
          shipment_row_id?: string
          study_id?: string
          tda?: number | null
          trt_calc?: number | null
          tso?: number | null
          tx_redespacho?: number | null
          valor_cobrado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "simulations_rate_row_id_fkey"
            columns: ["rate_row_id"]
            isOneToOne: false
            referencedRelation: "carrier_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_shipment_row_id_fkey"
            columns: ["shipment_row_id"]
            isOneToOne: false
            referencedRelation: "shipments_paid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          carrier_name: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          settings: Json
          status: string
        }
        Insert: {
          carrier_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          settings?: Json
          status?: string
        }
        Update: {
          carrier_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          settings?: Json
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
