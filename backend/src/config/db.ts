import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const envPathCandidates = [
  path.resolve(process.cwd(), "../data-pipeline/.env"),
  path.resolve(__dirname, "../../data-pipeline/.env"),
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of envPathCandidates) {
  dotenv.config({ path: envPath });
  if (process.env.SUPABASE_URL) {
    break;
  }
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
