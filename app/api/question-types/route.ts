// app/api/question-types/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { PoolConnection, RowDataPacket, FieldPacket } from 'mysql2/promise';

interface QuestionTypeRow extends RowDataPacket {
  id: number;
  type_name: string;
  icon?: string;
  description?: string;
  is_multiple_choice: number;  // tinyint(1) as number (0/1)
  created_at?: string;
}

interface QuestionType {
  id: number;
  type_name: string;
  icon?: string;
  description?: string;
  is_multiple_choice: boolean;  // Convert to boolean
  created_at?: string;
}

export async function GET(request: NextRequest) {
  let connection: PoolConnection | null = null;
  try {
    connection = await db.getConnection();

    // Query không cần filter user_id, lấy tất cả types
    const query = 'SELECT id, type_name, icon, description, is_multiple_choice, created_at FROM question_types ORDER BY type_name ASC';
    const params: [] = [];  // No params needed

    const [rows]: [QuestionTypeRow[], FieldPacket[]] = await connection.execute(query, params);

    const types: QuestionType[] = rows.map(row => ({
      id: row.id,
      type_name: row.type_name,
      icon: row.icon || undefined,
      description: row.description || undefined,
      is_multiple_choice: Boolean(row.is_multiple_choice),  // Convert 0/1 to boolean
      created_at: row.created_at || undefined,
    }));

    // Fallback: Nếu empty, insert defaults và re-fetch (tương tự generate API)
    if (types.length === 0) {
      await connection.execute(
        "INSERT IGNORE INTO question_types (type_name, icon, description, is_multiple_choice) VALUES " +
        "('multiple_choice', '🔢', 'Trắc nghiệm nhiều lựa chọn', 1), " +
        "('open_ended', '📝', 'Câu hỏi tự luận mở', 0)"
      );

      // Re-fetch sau insert
      const [defaultRows]: [QuestionTypeRow[], FieldPacket[]] = await connection.execute(query, params);
      types.splice(0, types.length, ...defaultRows.map(row => ({
        id: row.id,
        type_name: row.type_name,
        icon: row.icon || undefined,
        description: row.description || undefined,
        is_multiple_choice: Boolean(row.is_multiple_choice),
        created_at: row.created_at || undefined,
      })));
    }

    return NextResponse.json(types);
  } catch (error: unknown) {
    console.error('Error fetching question types:', error);
    return NextResponse.json(
      { error: 'Không thể lấy danh sách loại câu hỏi' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}