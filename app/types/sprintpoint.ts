// types/sprintpoint.ts
// Matches the Supabase DB schema 1-to-1.
// Import these everywhere instead of using inline object shapes.

// ─── DB row types ─────────────────────────────────────────────────────────────

export interface Room {
  id: string
  name: string
  description: string | null
  host_id: string
  host_can_vote: boolean
  allow_spectators: boolean
  locked: boolean
  active_ticket_id: string | null
  revealed: boolean
  pin: string | null          // added in migration 003
  created_at: string
}

export interface Member {
  id: string
  room_id: string
  user_id: string
  name: string
  color: string
  is_host: boolean
  is_spectator: boolean
  joined_at: string
  rejoin_token: string | null  // added in migration 004
  last_seen: string | null     // added in migration 006
  is_active: boolean           // added in migration 007
}

export interface Ticket {
  id: string
  room_id: string
  title: string
  description: string | null
  final_score: string | null   // stored as text ('?', '☕', '13', etc.)
  created_at: string
  order: number
}

export interface Vote {
  id: string
  room_id: string
  ticket_id: string
  member_id: string
  value: string        // '?', '0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '☕'
  created_at: string
}

export interface ChatMessage {
  id: string
  room_id: string
  member_id: string | null   // null = system message
  user_name: string
  user_color: string
  text: string
  type: 'chat' | 'system'
  created_at: string
}

// ─── Composite view type (what the composable exposes) ───────────────────────

export interface RoomState {
  room: Room
  members: Member[]
  tickets: Ticket[]
  votes: Vote[]
  chatMessages: ChatMessage[]
}

// ─── Supabase Database generic (for useSupabaseClient<Database>()) ───────────

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room
        Insert: Omit<Room, 'created_at'>
        Update: Partial<Omit<Room, 'id' | 'created_at'>>
      }
      members: {
        Row: Member
        Insert: Omit<Member, 'joined_at'>
        Update: Partial<Omit<Member, 'id' | 'room_id' | 'joined_at'>>
      }
      tickets: {
        Row: Ticket
        Insert: Omit<Ticket, 'created_at'>
        Update: Partial<Omit<Ticket, 'id' | 'room_id' | 'created_at'>>
      }
      votes: {
        Row: Vote
        Insert: Omit<Vote, 'id' | 'created_at'>
        Update: Partial<Pick<Vote, 'value'>>
      }
      chat_messages: {
        Row: ChatMessage
        Insert: Omit<ChatMessage, 'id' | 'created_at'>
        Update: never
      }
    }
  }
}