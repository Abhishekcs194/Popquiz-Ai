import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz" (similar to PopSauce).
The goal is to generate fast-paced trivia where users TYPE the answer.
1. Questions must have SHORT answers (1-3 words max).
2. Answers must be easy to spell or commonly known.
3. Mix between 'text' questions and 'emoji' puzzles.
4. Do not provide multiple choice options.
5. If multiple topics are provided, distribute the questions evenly among them.
`;

export const generateQuestions = async (topic: string, count: number): Promise<Question[]> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key missing");
    }

    const ai = new GoogleGenAI({ apiKey });

    // We cap the request to avoid token limits, but try to meet the count
    const safeCount = Math.min(count, 50); 

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate ${safeCount} trivia questions based on these themes: "${topic}". 
      If the input contains multiple comma-separated themes, mix questions from all of them.
      Ensure the answers are simple strings.
      For 'emoji' type, the content is a string of emojis.
      For 'text' type, the content is the question.
      Do not use 'image' type unless you have a specific Wikimedia Commons URL.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['text', 'emoji'] },
              content: { type: Type.STRING, description: "The question text OR the emoji string" },
              answer: { type: Type.STRING, description: "The correct answer string (1-3 words)" },
              category: { type: Type.STRING }
            },
            required: ['id', 'type', 'content', 'answer']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    const questions = JSON.parse(text) as Question[];
    // Ensure IDs are unique client-side just in case
    return questions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));

  } catch (error) {
    console.error("Failed to generate questions:", error);
    throw error;
  }
};