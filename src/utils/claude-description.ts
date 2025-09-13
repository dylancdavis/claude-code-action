#!/usr/bin/env bun

/**
 * Claude description generation utility for intelligent branch naming
 */

import fetch from "node-fetch";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
}

interface AnthropicResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

/**
 * Generate a branch description using Claude
 */
export async function generateClaudeDescription(
  title: string,
  body: string,
  entityType: "issue" | "pr",
): Promise<string> {
  // Check for API credentials
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (!anthropicApiKey && !claudeCodeOauthToken) {
    throw new Error(
      "No Claude API credentials available for description generation",
    );
  }

  const systemPrompt = `You are a branch name generator. Your task is to create a concise, descriptive 3-4 word kebab-case name for a git branch based on an ${entityType} title and description.

Rules:
- Output ONLY the kebab-case branch name (e.g., "fix-auth-bug" or "add-user-validation")  
- Use 3-4 words maximum
- Use lowercase with hyphens only
- Be specific and descriptive about what the change does
- Focus on the action being taken (fix, add, update, remove, etc.)
- No prefixes or suffixes, just the core description`;

  const userPrompt = `Title: ${title}

${body ? `Description: ${body.substring(0, 500)}` : "No description provided."}

Generate a 3-4 word kebab-case branch name:`;

  const request: AnthropicRequest = {
    model: "claude-3-5-haiku-20241022",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  };

  try {
    // Use appropriate authentication
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };

    if (anthropicApiKey) {
      headers["x-api-key"] = anthropicApiKey;
    } else if (claudeCodeOauthToken) {
      headers["authorization"] = `Bearer ${claudeCodeOauthToken}`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Claude API request failed: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    if (!data.content || data.content.length === 0) {
      throw new Error("No content returned from Claude API");
    }

    const description = data.content[0]?.text?.trim() || "";

    // Clean and validate the response
    return sanitizeBranchDescription(description);
  } catch (error) {
    console.error("Failed to generate Claude description:", error);
    throw error;
  }
}

/**
 * Sanitize and validate Claude's response to ensure it's a valid branch name
 */
function sanitizeBranchDescription(description: string): string {
  return (
    description
      .toLowerCase()
      .trim()
      // Remove any quotes or extra formatting
      .replace(/^["']|["']$/g, "")
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, "-")
      // Remove any non-alphanumeric characters except hyphens
      .replace(/[^a-z0-9-]/g, "")
      // Replace multiple hyphens with single hyphen
      .replace(/-+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-|-$/g, "")
      // Ensure it's not empty and has reasonable length
      .substring(0, 50) || "claude-generated"
  );
}

/**
 * Generate a description with fallback to simple title parsing
 */
export async function generateDescriptionWithFallback(
  title: string,
  body: string,
  entityType: "issue" | "pr",
  enableClaudeGeneration: boolean,
): Promise<string> {
  if (!enableClaudeGeneration) {
    // Fallback to simple title parsing (existing logic)
    return (
      title
        .split(/\s+/)
        .slice(0, 3)
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "simple-description"
    );
  }

  try {
    const claudeDescription = await generateClaudeDescription(
      title,
      body,
      entityType,
    );
    console.log(`Generated Claude description: "${claudeDescription}"`);
    return claudeDescription;
  } catch (error) {
    console.warn(
      "Claude description generation failed, falling back to title parsing:",
      error,
    );
    // Fallback to simple title parsing
    return (
      title
        .split(/\s+/)
        .slice(0, 3)
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "fallback-description"
    );
  }
}
