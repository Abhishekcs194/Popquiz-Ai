import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";
import { getSmartImage } from "./imageService";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for "PopQuiz".
Generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Bracket Logic**: If user input has "(images)" (e.g. "Pokemon(images)"), ALL questions must be 'image' type.
   
2. **Image Sourcing**:
   - For 'image' questions, provide the **Visual Subject** in 'content' (e.g. "Pikachu", "Iron Man").
   - **IMPORTANT**: Classify the image type in 'imageType' (pokemon, anime, flag, logo, art, game, movie, general).
     - "Pikachu" -> imageType: "pokemon"
     - "France" -> imageType: "flag"
     - "Naruto" -> imageType: "anime"
     - "Starry Night" -> imageType: "art"
     - "Elden Ring" -> imageType: "game"

3. **Ratio**: ~35% 'image' questions, ~65% 'text' questions (unless "(images)" is used).

4. **Answers**: 
   - SHORT (1-3 words).
   - **Unique**: No duplicates.
   - **Accepted Answers**: Provide aliases.

5. **Question Text**:
   - For image questions, include 'questionText' (e.g. "Name this character").
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
              content: { type: Type.STRING, description: "Search Term" },
              questionText: { type: Type.STRING },
              answer: { type: Type.STRING },
              acceptedAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              category: { type: Type.STRING },
              imageType: { 
                  type: Type.STRING, 
                  enum: ['pokemon', 'anime', 'flag', 'logo', 'art', 'game', 'movie', 'general', 'animal'],
                  description: "Category for API routing" 
              }
            },
            required: ['id', 'type', 'content', 'answer']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    let questions = JSON.parse(text) as Question[];
    
    // --- Post-Processing: Fetch Images using Smart Router ---
    const resolvedQuestions = await Promise.all(questions.map(async (q): Promise<Question> => {
        if (q.type === 'image') {
            // Context Injection: Append topic to query if strictly needed
            // This prevents "Rennala" -> finding a random person named Rennala
            // Becomes "Rennala Elden Ring"
            let searchContext = q.content;
            const needsContext = ['game', 'anime', 'movie', 'book', 'character'].includes(q.imageType || '');
            
            if (needsContext && topic) {
                // Simple check to avoid double inclusion "Elden Ring Elden Ring"
                if (!searchContext.toLowerCase().includes(topic.toLowerCase())) {
                    searchContext = `${searchContext} ${topic}`;
                }
            }

            const realUrl = await getSmartImage(searchContext, q.imageType);
            
            if (realUrl) {
                return { ...q, content: realUrl };
            } else {
                console.warn(`[GeminiService] No image found for '${searchContext}'. Using placeholder.`);
                return { 
                    ...q, 
                    content: "https://placehold.co/600x400/202020/FFFFFF?text=Image+Unavailable",
                    type: 'image', 
                    questionText: `${q.questionText} (Image Missing)`
                };
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