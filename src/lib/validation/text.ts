import { z } from "zod";

/**
 * Texto livre seguro: sem < >, sem caracteres de controle, sem espaços nas
 * pontas. Espelha app_private.is_safe_text no banco (defesa em profundidade:
 * o React já escapa a saída, mas rejeitamos marcação na entrada).
 */
export function safeText(min: number, max: number) {
  return z
    .string({ error: "Texto inválido." })
    .trim()
    .min(min, { error: min === 1 ? "Campo obrigatório." : `Mínimo de ${min} caracteres.` })
    .max(max, { error: `Máximo de ${max} caracteres.` })
    .refine((v) => !/[<>]/.test(v), { error: "Os caracteres < e > não são permitidos." })
    .refine((v) => !/[\u0000-\u001F\u007F]/.test(v), { error: "Caracteres de controle não são permitidos." });
}

export const descriptionSchema = safeText(1, 120);
export const notesSchema = safeText(1, 1000);
export const tagSchema = safeText(1, 30);
export const tagsSchema = z.array(tagSchema).max(10, { error: "Máximo de 10 tags." });
