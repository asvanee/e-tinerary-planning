import type { Request, Response } from "express";
import { getRecommendedPlaces } from "./recommendation.service";

export async function recommend(req: Request, res: Response) {
  try {
    const preferences = req.body ?? {};
    const places = await getRecommendedPlaces(preferences);
    res.json(places);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to recommend places", error: err });
  }
}