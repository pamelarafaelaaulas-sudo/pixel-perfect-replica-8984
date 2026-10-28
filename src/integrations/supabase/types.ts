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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_evaluations: {
        Row: {
          created_at: string
          criteria: Json
          evaluated_text: string
          group_id: string
          id: string
          overall: number
          phase_number: number
          project_id: string
          requested_by: string | null
          summary: string
          tips: Json
        }
        Insert: {
          created_at?: string
          criteria?: Json
          evaluated_text?: string
          group_id: string
          id?: string
          overall: number
          phase_number: number
          project_id: string
          requested_by?: string | null
          summary?: string
          tips?: Json
        }
        Update: {
          created_at?: string
          criteria?: Json
          evaluated_text?: string
          group_id?: string
          id?: string
          overall?: number
          phase_number?: number
          project_id?: string
          requested_by?: string | null
          summary?: string
          tips?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_evaluations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evaluations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_drive_files: {
        Row: {
          drive_file_id: string
          group_id: string
          project_id: string
          source_path: string
          synced_at: string
        }
        Insert: {
          drive_file_id: string
          group_id: string
          project_id: string
          source_path: string
          synced_at?: string
        }
        Update: {
          drive_file_id?: string
          group_id?: string
          project_id?: string
          source_path?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_drive_files_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_drive_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          banner_instructions: string | null
          banner_sections: string[] | null
          banner_size: string | null
          banner_template_url: string | null
          class_code: string
          code_label: string | null
          created_at: string
          id: string
          late_penalty_per_day: number
          name: string
          teacher_id: string
        }
        Insert: {
          banner_instructions?: string | null
          banner_sections?: string[] | null
          banner_size?: string | null
          banner_template_url?: string | null
          class_code?: string
          code_label?: string | null
          created_at?: string
          id?: string
          late_penalty_per_day?: number
          name: string
          teacher_id: string
        }
        Update: {
          banner_instructions?: string | null
          banner_sections?: string[] | null
          banner_size?: string | null
          banner_template_url?: string | null
          class_code?: string
          code_label?: string | null
          created_at?: string
          id?: string
          late_penalty_per_day?: number
          name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          feedback: string | null
          group_id: string
          id: string
          is_reference_ten: boolean
          score: number
          trimester: number
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          group_id: string
          id?: string
          is_reference_ten?: boolean
          score: number
          trimester: number
        }
        Update: {
          created_at?: string
          feedback?: string | null
          group_id?: string
          id?: string
          is_reference_ten?: boolean
          score?: number
          trimester?: number
        }
        Relationships: [
          {
            foreignKeyName: "grades_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          class_id: string
          group_id: string
          id: string
          joined_at: string
          student_id: string
          whatsapp: string
        }
        Insert: {
          class_id: string
          group_id: string
          id?: string
          joined_at?: string
          student_id: string
          whatsapp: string
        }
        Update: {
          class_id?: string
          group_id?: string
          id?: string
          joined_at?: string
          student_id?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          class_id: string
          created_at: string
          group_name: string
          id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          group_name: string
          id?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          group_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_evaluations: {
        Row: {
          created_at: string
          evaluated_student_id: string
          evaluator_student_id: string
          feedback: string | null
          group_id: string
          id: string
          score: number
          trimester: number
        }
        Insert: {
          created_at?: string
          evaluated_student_id: string
          evaluator_student_id: string
          feedback?: string | null
          group_id: string
          id?: string
          score: number
          trimester: number
        }
        Update: {
          created_at?: string
          evaluated_student_id?: string
          evaluator_student_id?: string
          feedback?: string | null
          group_id?: string
          id?: string
          score?: number
          trimester?: number
        }
        Relationships: [
          {
            foreignKeyName: "peer_evaluations_evaluated_student_id_fkey"
            columns: ["evaluated_student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_evaluations_evaluator_student_id_fkey"
            columns: ["evaluator_student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_evaluations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_submissions: {
        Row: {
          id: string
          phase_number: number
          project_id: string
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          id?: string
          phase_number: number
          project_id: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          id?: string
          phase_number?: number
          project_id?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phase_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      project_contributions: {
        Row: {
          char_count_added: number
          edited_at: string
          id: string
          project_id: string
          section_name: string
          student_id: string
        }
        Insert: {
          char_count_added?: number
          edited_at?: string
          id?: string
          project_id: string
          section_name: string
          student_id: string
        }
        Update: {
          char_count_added?: number
          edited_at?: string
          id?: string
          project_id?: string
          section_name?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contributions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          abstract: string | null
          area_code: string | null
          area_subarea: string | null
          banner_canva_url: string | null
          banner_file_name: string | null
          banner_file_path: string | null
          conclusion: string | null
          current_phase: number
          general_objective: string | null
          group_id: string
          guiding_question: string | null
          id: string
          institution: string | null
          introduction: string | null
          keywords: string | null
          methodology: string | null
          project_seq: number | null
          references_list: string | null
          results_discussion: string | null
          scientific_articles: Json
          specific_objectives: string | null
          theme: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          abstract?: string | null
          area_code?: string | null
          area_subarea?: string | null
          banner_canva_url?: string | null
          banner_file_name?: string | null
          banner_file_path?: string | null
          conclusion?: string | null
          current_phase?: number
          general_objective?: string | null
          group_id: string
          guiding_question?: string | null
          id?: string
          institution?: string | null
          introduction?: string | null
          keywords?: string | null
          methodology?: string | null
          project_seq?: number | null
          references_list?: string | null
          results_discussion?: string | null
          scientific_articles?: Json
          specific_objectives?: string | null
          theme?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          abstract?: string | null
          area_code?: string | null
          area_subarea?: string | null
          banner_canva_url?: string | null
          banner_file_name?: string | null
          banner_file_path?: string | null
          conclusion?: string | null
          current_phase?: number
          general_objective?: string | null
          group_id?: string
          guiding_question?: string | null
          id?: string
          institution?: string | null
          introduction?: string | null
          keywords?: string | null
          methodology?: string | null
          project_seq?: number | null
          references_list?: string | null
          results_discussion?: string | null
          scientific_articles?: Json
          specific_objectives?: string | null
          theme?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          class_id: string
          due_date: string
          id: string
          phase_name: string
          phase_number: number
        }
        Insert: {
          class_id: string
          due_date: string
          id?: string
          phase_name: string
          phase_number: number
        }
        Update: {
          class_id?: string
          due_date?: string
          id?: string
          phase_name?: string
          phase_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          used_at: string | null
          used_by: string | null
          used_by_name: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          created_by: string
          id?: string
          used_at?: string | null
          used_by?: string | null
          used_by_name?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
          used_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      banner_group: { Args: { _name: string }; Returns: string }
      can_edit_banner: { Args: { _group_id: string }; Returns: boolean }
      canva_design_id: { Args: { _url: string }; Returns: string }
      consume_teacher_invite: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      create_group: {
        Args: {
          _area: string
          _code: string
          _group_name: string
          _whatsapp: string
        }
        Returns: string
      }
      find_class: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
          teacher_name: string
        }[]
      }
      first_missing_reference: {
        Args: { _cited: string; _refs: string }
        Returns: string
      }
      fold_text: { Args: { _t: string }; Returns: string }
      group_ai_suggestions: {
        Args: { _group_id: string }
        Returns: {
          created_at: string
          criteria: Json
          id: string
          phase_number: number
          requested_by: string
          summary: string
          tips: Json
        }[]
      }
      has_author_date_citation: { Args: { _t: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_class_student: { Args: { _class_id: string }; Returns: boolean }
      is_group_member: { Args: { _group_id: string }; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      join_group: {
        Args: { _group_id: string; _whatsapp: string }
        Returns: string
      }
      list_class_groups: {
        Args: { _code: string }
        Returns: {
          group_id: string
          group_name: string
          member_count: number
        }[]
      }
      phase_rule_problem: {
        Args: {
          _p: Database["public"]["Tables"]["projects"]["Row"]
          _phase: number
        }
        Returns: string
      }
      phase_rule_problem_base: {
        Args: {
          _p: Database["public"]["Tables"]["projects"]["Row"]
          _phase: number
        }
        Returns: string
      }
      project_group: { Args: { _project_id: string }; Returns: string }
      redeem_teacher_invite: { Args: { _code: string }; Returns: undefined }
      reference_is_missing: {
        Args: { _authors: string; _lines: string[]; _year: string }
        Returns: boolean
      }
      shares_group_with: { Args: { _other: string }; Returns: boolean }
      submit_phase: { Args: { _project_id: string }; Returns: number }
      teaches_class: { Args: { _class_id: string }; Returns: boolean }
      teaches_group: { Args: { _group_id: string }; Returns: boolean }
      teaches_student: { Args: { _student_id: string }; Returns: boolean }
      word_count: { Args: { _t: string }; Returns: number }
    }
    Enums: {
      app_role: "teacher" | "student"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["teacher", "student"],
    },
  },
} as const
