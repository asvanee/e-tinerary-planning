import { Router } from "express";
import { getCategories } from "./categoriesController";

const router = Router();

router.get("/", getCategories);

export default router;