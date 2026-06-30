import express from "express";
import { recommend } from "./recommendation.controller";

const router = express.Router();

router.get("/", recommend);
router.post("/", recommend);

export default router;