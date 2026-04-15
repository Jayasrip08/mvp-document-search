# Hugging Face Spaces Deployment Guide - DocSearch AI

This guide will show you how to deploy your application for **free** on Hugging Face Spaces. This setup uses a "Unified Docker" approach to run your entire stack in a single free container.

## Prerequisites
1. A **Hugging Face** account.
2. A **GitHub** account (to sync your code).
3. A **Supabase** project (recommended for persistent search history).

---

## Step 1: Create a New Space
1. Log in to [Hugging Face](https://huggingface.co/).
2. Click **New** -> **Space**.
3. **Space Name**: `DocSearch-AI` (or any name).
4. **License**: Choose any (e.g., MIT).
5. **Select SDK**: **Docker**.
6. **Docker Template**: Blank (or any).
7. **Space Hardware**: Free tier (2 vCPU, 16GB RAM).
8. **Visibility**: Public (recommended).
9. Click **Create Space**.

## Step 2: Configure Environment Secrets
1. In your new Space, go to the **Settings** tab.
2. Scroll down to **Variables and secrets**.
3. Under **Secrets**, click **New secret** for each of these:
   - `OPENAI_API_KEY`: Your OpenAI key.
   - `OPENAI_MODEL_NAME`: `gpt-4o-mini`.
   - `DATABASE_URL`: Your Supabase connection string.
   
   *Tip: Use the "Transaction Mode" pooled connection string from Supabase Settings -> Database.*

## Step 3: Deployment
Hugging Face uses **Access Tokens** instead of passwords for Git operations.

1. **Generate a Token**:
   - Go to [Hugging Face Settings -> Tokens](https://huggingface.co/settings/tokens).
   - Click **New token**.
   - **Name**: `Space-Push`
   - **Type**: **Write**.
   - Click **Generate token** and **Copy** it.

2. **Add the Remote** (if not already added):
   ```bash
   git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/DocSearch-AI
   ```

3. **Push your code**:
   ```bash
   git push hf main
   ```
   - When prompted for **Username**, enter your Hugging Face username (`jayasrip1808`).
   - When prompted for **Password**, **PASTE THE ACCESS TOKEN** you copied earlier.

   *Tip: If you want to avoid being asked for a token every time, run:*
   ```bash
   git remote set-url hf https://jayasrip1808:YOUR_TOKEN@huggingface.co/spaces/jayasrip1808/DocSearch-AI
   ```

4. Alternatively, you can upload the files directly to the **Files** tab in your Hugging Face Space.

## Step 4: Verify
1. Wait for Hugging Face to build and start your container (this takes ~5-10 minutes).
2. Once the status turns green (**Running**), your application will be available on the **App** tab.

---

## Important Notes on Persistence
- **Search History**: Because we are using **Supabase**, your past queries and AI answers will stay saved even if the server restarts.
- **Indexed Documents**: The free tier of Hugging Face does not have a persistent local disk. If the server restarts (e.g., after being idle), you may need to re-upload your PDFs to index them again.
  - *Solution*: If you need permanent file storage, you can enable "Persistent Storage" in the Hugging Face Space settings for a small monthly fee.

---

### Pro-Tip: Using SQL Shell with Cloud DB
Once you have your Supabase URI, you can connect to it from your local machine using:
`psql "YOUR_SUPABASE_URI"`
This lets you run queries and manage tables exactly like you do with your local database.