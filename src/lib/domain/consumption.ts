import type { CategoryKey } from "@/lib/supabase/database.types";
import { normalizeText } from "./text";

/**
 * Tipo de consumo (o "quê": bares e restaurantes, mercado, transporte…),
 * complementar à seção do orçamento (o "porquê": Custos fixos, Conforto…).
 * Cada tipo tem uma seção padrão, usada como sugestão na importação da fatura.
 */

export const CONSUMPTION_KEYS = [
  "mercado",
  "bares_restaurantes",
  "delivery",
  "moradia_contas",
  "saude",
  "transporte",
  "assinaturas",
  "cuidados_pessoais",
  "pets",
  "casa",
  "compras",
  "lazer",
  "viagem",
  "educacao",
  "investimentos",
  "servicos",
  "outros",
] as const;
export type ConsumptionKey = (typeof CONSUMPTION_KEYS)[number];

export const CONSUMPTION: Record<ConsumptionKey, { label: string; section: CategoryKey }> = {
  mercado: { label: "Mercado", section: "custos_fixos" },
  bares_restaurantes: { label: "Bares e restaurantes", section: "prazeres" },
  delivery: { label: "Delivery", section: "prazeres" },
  moradia_contas: { label: "Moradia e contas", section: "custos_fixos" },
  saude: { label: "Saúde e farmácia", section: "custos_fixos" },
  transporte: { label: "Transporte", section: "conforto" },
  assinaturas: { label: "Assinaturas e apps", section: "conforto" },
  cuidados_pessoais: { label: "Cuidados pessoais", section: "conforto" },
  pets: { label: "Pets", section: "conforto" },
  casa: { label: "Casa", section: "conforto" },
  compras: { label: "Compras", section: "prazeres" },
  lazer: { label: "Lazer", section: "prazeres" },
  viagem: { label: "Viagem", section: "prazeres" },
  educacao: { label: "Educação", section: "conhecimento" },
  investimentos: { label: "Investimentos", section: "liberdade_financeira" },
  servicos: { label: "Serviços", section: "custos_fixos" },
  outros: { label: "Outros", section: "prazeres" },
};

export function isConsumptionKey(v: unknown): v is ConsumptionKey {
  return typeof v === "string" && (CONSUMPTION_KEYS as readonly string[]).includes(v);
}

/** Regras por palavra-chave (texto já normalizado: minúsculo, sem acento). Ordem importa. */
const RULES: [RegExp, ConsumptionKey][] = [
  [/\b(ifood|ifd|rappi|ze delivery|aiqfome|james delivery|uber eats|delivery)\b/, "delivery"],
  [/\b(supermercado|supermercados|mercado|mercadinho|carrefour|pao de acucar|assai|atacadao|atacadista|extra|dia|hortifruti|hortifrutti|sacolao|st marche|oba|zona sul|mambo|sonda|savegnago|dalben|emporio|acougue|swift|minuto pa|oxxo|quitanda)\b/, "mercado"],
  [/\b(restaurante|rest|bar|boteco|choperia|cervejaria|pub|lanchonete|lanches|padaria|panificadora|cafe|cafeteria|starbucks|pizzaria|pizza|hamburgueria|burger|mcdonalds|mc donalds|burger king|bk|outback|madero|coco bambu|sushi|temaki|churrascaria|bistro|trattoria|cantina|sorveteria|doceria|confeitaria|giraffas|habibs|subway|spoleto|kfc|popeyes|petiscaria|adega|emporio da cerveja)\b/, "bares_restaurantes"],
  [/\b(aluguel|condominio|enel|cemig|light|copel|celesc|coelba|energia|eletropaulo|sabesp|cedae|copasa|saneamento|agua|comgas|naturgy|ultragaz|liquigas|internet|vivo|claro|tim|oi|net|sky|iptu|ipva|detran|seguro|porto seguro|tokio marine|allianz)\b/, "moradia_contas"],
  [/\b(farmacia|drogasil|droga raia|raia|drogaria|pague menos|panvel|onofre|sao joao|unimed|amil|sulamerica|bradesco saude|hapvida|notredame|hospital|clinica|laboratorio|fleury|dasa|lavoisier|delboni|dentista|odonto|medico|psicolog|fisioterapia|otica)\b/, "saude"],
  [/\b(uber|99|99app|99 pop|cabify|taxi|posto|shell|ipiranga|petrobras|br mania|ale combustiveis|combustivel|estacionamento|estapar|zona azul|sem parar|conectcar|veloe|move mais|pedagio|metro|cptm|sptrans|bilhete unico|onibus|localiza|movida|unidas|oficina|auto pecas|lava rapido)\b/, "transporte"],
  [/\b(netflix|spotify|disney|hbo|max|prime video|amazon prime|primevideo|apple com bill|apple|icloud|google one|google storage|youtube|deezer|globoplay|paramount|star plus|crunchyroll|chatgpt|openai|claude|anthropic|microsoft|office|adobe|canva|dropbox|notion|tinder|bumble|assinatura)\b/, "assinaturas"],
  [/\b(academia|smartfit|smart fit|bodytech|bio ritmo|wellhub|gympass|totalpass|crossfit|pilates|yoga|barbearia|barber|salao|cabeleireiro|manicure|estetica|depilacao|spa|boticario|natura|sephora|perfumaria|cosmeticos)\b/, "cuidados_pessoais"],
  [/\b(pet|petz|cobasi|petlove|veterinari|vet|racao|pet shop|petshop)\b/, "pets"],
  [/\b(leroy merlin|telhanorte|c c|cec|tok stok|tokstok|etna|camicado|mobly|madeiramadeira|madeira madeira|westwing|casa e video|ferragens|ferragem|material de construcao|construcao|moveis|decoracao|eletrodomestic|lavanderia|diarista)\b/, "casa"],
  [/\b(cinema|cinemark|kinoplex|uci|ingresso|ingressos|sympla|eventim|ticket|tickets|show|teatro|museu|parque|clube|jogo|steam|playstation|psn|xbox|nintendo|boliche|karaoke)\b/, "lazer"],
  [/\b(viagem|viagens|hotel|hoteis|pousada|resort|hostel|airbnb|booking|expedia|decolar|hurb|latam|gol|azul|tap|american airlines|cvc|smiles|livelo|rodoviaria|aeroporto|duty free|seguro viagem)\b/, "viagem"],
  [/\b(udemy|coursera|alura|hotmart|eduzz|kiwify|livraria|livros|kindle|saraiva|cultura|escola|colegio|curso|cursos|faculdade|universidade|ingles|idiomas|duolingo|domestika|masterclass|papelaria|kalunga)\b/, "educacao"],
  [/\b(corretora|xp investimentos|btg pactual invest|rico|clear|nuinvest|tesouro direto|previdencia|investimento|investimentos|cdb|lci|lca|aplicacao|aplic|poupanca|fundo de investimento|fundos)\b/, "investimentos"],
  [/\b(zara|renner|riachuelo|cea|c a|hering|marisa|shein|nike|adidas|centauro|decathlon|netshoes|dafiti|arezzo|mercado livre|mercadolivre|shopee|aliexpress|amazon|amzn|magalu|magazine luiza|americanas|casas bahia|fast shop|kabum|ponto frio|shopping|loja|lojas|calcados|roupas|joalheria|vivara|pandora|presente)\b/, "compras"],
  [/\b(contabilizei|contador|advogado|cartorio|correios|lavanderia|chaveiro|conserto|assistencia tecnica|despachante|anuidade|tarifa|iof|juros|encargos)\b/, "servicos"],
];

/** Sugere o tipo de consumo pela descrição (sem serviços externos). */
export function consumptionFromText(description: string): ConsumptionKey | null {
  const n = normalizeText(description).replace(/[*#._/-]/g, " ").replace(/\s+/g, " ");
  for (const [re, key] of RULES) if (re.test(n)) return key;
  return null;
}
