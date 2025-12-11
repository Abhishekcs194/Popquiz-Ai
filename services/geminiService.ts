import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz".
The goal is to generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Bracket Logic**: The user input may contain brackets like "Pokemon(images)" or "History(easy)".
   - If "(images)" is present for a topic, 100% of questions for that topic MUST be 'image' type.
   - If "(easy)", "(hard)", etc. are present, adjust difficulty accordingly.
   
2. **Image Generation**: 
   - DO NOT search for real URLs. 
   - Instead, generate a dynamic URL using this format: "https://image.pollinations.ai/prompt/{visual_description_of_image}?width=800&height=600&nologo=true"
   - Replace {visual_description_of_image} with a vivid, simple description encoded for a URL (e.g. "pikachu%20cartoon", "eiffel%20tower%20at%20night").
   - Ensure the description allows the player to guess the answer.

3. **Ratio**: Unless "(images)" is specified, aim for ~35% 'image' type and ~65% 'text' type mix.

4. **Answers**: 
   - Must be SHORT (1-3 words max).
   - **Unique**: No repeating answers in the set.
   - **Abbreviations**: Provide an array of 'acceptedAnswers' for common aliases (e.g. Answer: "United States", Accepted: ["USA", "US", "America"]).

5. **No Emojis**: Do not use emoji puzzles.
`;

// Fisher-Yates Shuffle
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export const generateQuestions = async (topic: string, count: number, existingAnswers: string[] = []): Promise<Question[]> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key missing");
    }

    const ai = new GoogleGenAI({ apiKey });

    // We cap the request to avoid token limits
    const safeCount = Math.min(count, 30); 

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate ${safeCount} trivia questions based on these themes: "${topic}".
      
      Generate a healthy mix of questions from ALL provided themes. Do not group them by topic.
      
      Existing answers to avoid: ${JSON.stringify(existingAnswers)}.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['text', 'image'] },
              content: { type: Type.STRING, description: "The question text OR the pollinations.ai URL" },
              answer: { type: Type.STRING, description: "The primary correct answer (1-3 words)" },
              acceptedAnswers: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "List of acceptable abbreviations or alternate spellings" 
              },
              category: { type: Type.STRING }
            },
            required: ['id', 'type', 'content', 'answer']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    let questions = JSON.parse(text) as Question[];
    
    // Assign IDs and Shuffle strictly to mix topics
    questions = questions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));
    return shuffleArray(questions);

  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
};