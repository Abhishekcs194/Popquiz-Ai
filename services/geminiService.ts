import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";
import { getWikimediaImage } from "./wikiService";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for "PopQuiz".
Generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Bracket Logic**: If user input has "(images)" (e.g. "Pokemon(images)"), ALL questions must be 'image' type.
   
2. **Image Sourcing**:
   - For 'image' questions, the 'content' field must be a **Wikipedia Search Term**.
   - **Good**: "Iron Man", "Coca-Cola", "African Lion", "The Starry Night".
   - **Bad**: "A picture of a superhero", "Red soda can".
   - The system searches Wikipedia for this exact term.

3. **Ratio**: ~35% 'image' questions, ~65% 'text' questions (unless "(images)" is used).

4. **Answers**: 
   - SHORT (1-3 words).
   - **Unique**: No duplicates.
   - **Accepted Answers**: Provide aliases in 'acceptedAnswers'.
   - Ensure the 'answer' matches the likely image for your search term.

5. **Question Text**:
   - For image questions, include 'questionText' (e.g. "Name this character", "Who painted this?").
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
    const safeCount = Math.min(count, 30); 

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate ${safeCount} trivia questions about: "${topic}".
      Avoid these answers: ${JSON.stringify(existingAnswers)}.`,
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
              content: { type: Type.STRING, description: "Wikipedia Search Term (e.g. 'Pikachu')" },
              questionText: { type: Type.STRING, description: "Question to ask above the image" },
              answer: { type: Type.STRING, description: "The correct answer" },
              acceptedAnswers: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
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
    
    // --- Post-Processing: Fetch Images ---
    const resolvedQuestions = await Promise.all(questions.map(async (q) => {
        if (q.type === 'image') {
            // Try Wikipedia/Commons first
            const realUrl = await getWikimediaImage(q.content);
            
            if (realUrl) {
                return { ...q, content: realUrl };
            } else {
                // LAST RESORT: AI Generation
                console.log(`[GeminiService] Wiki failed for '${q.content}', using AI fallback.`);
                const prompt = q.questionText || q.answer;
                const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${Math.random()}`;
                return { ...q, content: aiUrl };
            }
        }
        return q;
    }));

    const finalQuestions = resolvedQuestions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));
    return shuffleArray(finalQuestions);

  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
};