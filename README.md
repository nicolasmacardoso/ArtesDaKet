# ArtesDaKet

Site simples para guardar e exibir artes em 12 molduras digitais.

O foco da v1 é mobile: qualquer pessoa com o link consegue ver a galeria, mas apenas a dona configurada no Supabase consegue anexar, trocar e remover imagens.

## Stack

- React
- TypeScript
- Vite
- Supabase Auth
- Supabase Storage

## Configuração local

1. Instale as dependências:

```bash
npm install
```

2. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Preencha:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ADMIN_EMAIL=
```

4. Rode o projeto:

```bash
npm run dev
```

## Supabase

Execute o script em [supabase/schema.sql](supabase/schema.sql) no SQL Editor do Supabase.

Depois:

1. Crie a usuária administradora em Authentication.
2. Use o mesmo e-mail em `VITE_ADMIN_EMAIL`.
3. Confirme que o bucket `artes` foi criado como público.

## Como funciona

- A tabela `frames` mantém os 12 quadros fixos.
- O bucket `artes` armazena as imagens.
- Visitantes veem a galeria e podem abrir uma imagem inteira no modal.
- A administradora faz login para anexar, trocar ou remover imagens.

## Build

```bash
npm run build
```
