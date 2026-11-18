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
      menu_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          item_name: string
          menu_item_id: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          item_name: string
          menu_item_id: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          item_name?: string
          menu_item_id?: string
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          payment_status: "pending" | "paid" | "failed"
          payment_proof_url: string | null
          pickup_code: string
          pickup_time: string | null
          restaurant_id: string
          service_fee: number
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_status?: "pending" | "paid" | "failed"
          payment_proof_url?: string | null
          pickup_code?: string
          pickup_time?: string | null
          restaurant_id: string
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          student_id: string
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_status?: "pending" | "paid" | "failed"
          payment_proof_url?: string | null
          pickup_code?: string
          pickup_time?: string | null
          restaurant_id?: string
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          student_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          student_id: string | null
          university: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          student_id?: string | null
          university?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          student_id?: string | null
          university?: string | null
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          created_at: string
          cuisine: string | null
          description: string | null
          emoji: string | null
          id: string
          is_open: boolean
          name: string
          slug: string
          university_id: string
        }
        Insert: {
          created_at?: string
          cuisine?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_open?: boolean
          name: string
          slug: string
          university_id?: string
        }
        Update: {
          created_at?: string
          cuisine?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_open?: boolean
          name?: string
          slug?: string
          university_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          university_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          university_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          university_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      universities: {
        Row: {
          contact_email: string | null
          email_domain: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          contact_email?: string | null
          email_domain: string
          id: string
          location?: string | null
          name: string
        }
        Update: {
          contact_email?: string | null
          email_domain?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      vendor_applications: {
        Row: {
          contact_number: string | null
          created_at: string
          cuisine: string | null
          description: string | null
          id: string
          restaurant_name: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          university_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_number?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          restaurant_name: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_number?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          restaurant_name?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      campus_directory: {
        Row: {
          email_domain: string
          id: string
          name: string
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_restaurant: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_university_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _university_id: string; _user_id: string }
        Returns: boolean
      }
      review_vendor_application: {
        Args: { _application_id: string; _decision: string; _review_note?: string }
        Returns: undefined
      }
      set_order_payment_status: {
        Args: { _order_id: string; _payment_status: string }
        Returns: undefined
      }
      submit_vendor_application: {
        Args: {
          _contact_number: string
          _cuisine?: string
          _description?: string
          _restaurant_name: string
          _university_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "student" | "vendor" | "campus_admin" | "platform_admin"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
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
      app_role: ["student", "vendor", "campus_admin", "platform_admin"],
      order_status: ["pending", "preparing", "ready", "completed", "cancelled"],
    },
  },
} as const
