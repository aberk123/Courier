export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      address_rulings: {
        Row: {
          created_at: string
          created_by: string | null
          house_number: string | null
          id: string
          note: string | null
          publication_id: string | null
          ruling: string
          street: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          house_number?: string | null
          id?: string
          note?: string | null
          publication_id?: string | null
          ruling: string
          street: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          house_number?: string | null
          id?: string
          note?: string | null
          publication_id?: string | null
          ruling?: string
          street?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_rulings_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          created_at: string
          description: string
          id: string
          shown_on_cover_sheet_at: string | null
          stop_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          shown_on_cover_sheet_at?: string | null
          stop_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          shown_on_cover_sheet_at?: string | null
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_courier_office: boolean
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_courier_office?: boolean
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_courier_office?: boolean
        }
        Relationships: []
      }
      publications: {
        Row: {
          active: boolean
          code: string
          courier_letter: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          courier_letter?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          courier_letter?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      route_entries: {
        Row: {
          created_at: string
          direction_text: string | null
          id: string
          kind: string
          sequence: number
          stop_id: string | null
          zone_id: string
        }
        Insert: {
          created_at?: string
          direction_text?: string | null
          id?: string
          kind: string
          sequence: number
          stop_id?: string | null
          zone_id: string
        }
        Update: {
          created_at?: string
          direction_text?: string | null
          id?: string
          kind?: string
          sequence?: number
          stop_id?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_entries_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_entries_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_instruction_changes: {
        Row: {
          created_at: string
          description: string
          id: string
          shown_on_cover_sheet_at: string | null
          stop_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          shown_on_cover_sheet_at?: string | null
          stop_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          shown_on_cover_sheet_at?: string | null
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_instruction_changes_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          applied_count: number
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          publication_id: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          applied_count?: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          publication_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          applied_count?: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          publication_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: []
      }
      stop_publication_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          import_run_id: string | null
          publication_id: string
          shown_on_cover_sheet_at: string | null
          stop_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          import_run_id?: string | null
          publication_id: string
          shown_on_cover_sheet_at?: string | null
          stop_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          publication_id?: string
          shown_on_cover_sheet_at?: string | null
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_publication_events_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_publication_events_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_publications: {
        Row: {
          publication_id: string
          stop_id: string
        }
        Insert: {
          publication_id: string
          stop_id: string
        }
        Update: {
          publication_id?: string
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_publications_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_publications_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          active: boolean
          created_at: string
          floor_side: string | null
          house_number: string
          id: string
          import_run_id: string | null
          roster_managed: boolean
          recipient_name: string | null
          special_instructions: string | null
          special_instructions_2: string | null
          street: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          floor_side?: string | null
          house_number: string
          id?: string
          import_run_id?: string | null
          roster_managed?: boolean
          recipient_name?: string | null
          special_instructions?: string | null
          special_instructions_2?: string | null
          street: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          floor_side?: string | null
          house_number?: string
          id?: string
          import_run_id?: string | null
          roster_managed?: boolean
          recipient_name?: string | null
          special_instructions?: string | null
          special_instructions_2?: string | null
          street?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_publication_access: {
        Row: {
          publication_id: string
          user_id: string
        }
        Insert: {
          publication_id: string
          user_id: string
        }
        Update: {
          publication_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_publication_access_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_publication_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          name: string | null
          number: number
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          number: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          number?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accessible_publication_ids: {
        Args: { p_user_id?: string }
        Returns: string[]
      }
      can_access_stop: {
        Args: { p_stop_id: string; p_user_id?: string }
        Returns: boolean
      }
      create_stop_in_route: {
        Args: {
          p_zone_id: string
          p_recipient_name: string | null
          p_house_number: string
          p_street: string
          p_floor_side: string | null
          p_special_instructions: string | null
          p_publication_ids: string[]
          p_import_run_id?: string | null
        }
        Returns: string
      }
      undo_import_run: { Args: { p_run_id: string }; Returns: Json }
      is_courier_office: { Args: { p_user_id?: string }; Returns: boolean }
      mark_cover_sheet_printed: {
        Args: { p_zone_id: string; p_publication_ids: string[] }
        Returns: number
      }
      remove_stop_publications: { Args: { p_stop_id: string }; Returns: number }
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
