import { config } from "dotenv";

// Testes de segurança/E2E rodam contra o projeto Supabase de DEV.
// Localmente as variáveis vêm de .env.test.local (no .gitignore); no CI, de secrets.
config({ path: ".env.test.local", quiet: true });
