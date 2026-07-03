import { Request, Response } from "express";
import { supabase } from "../../config/db";

export const getCategories = async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("categories")
    .select("category_id, category_name");

  if (error) return res.status(500).json({ message: error.message });
  res.json({ categories: data });
};