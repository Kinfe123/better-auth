import { defineDocs } from "@farming-labs/docs";
import { colorful } from "@farming-labs/theme/colorful";

export default defineDocs({
  entry: "docs",
  theme: colorful(),
  ordering: [
    {
      "slug": "quickstart"
    },
    {
      "slug": "installation"
    },
    {
      "slug": "comparison"
    },
    {
      "slug": "concepts",
      "children": [
        {
          "slug": "api"
        },
        {
          "slug": "cli"
        },
        {
          "slug": "client"
        },
        {
          "slug": "cookies"
        },
        {
          "slug": "database"
        },
        {
          "slug": "email"
        },
        {
          "slug": "hooks"
        },
        {
          "slug": "oauth"
        },
        {
          "slug": "plugins"
        },
        {
          "slug": "rate-limit"
        },
        {
          "slug": "session-management"
        },
        {
          "slug": "typescript"
        },
        {
          "slug": "users-accounts"
        }
      ]
    },
    {
      "slug": "authentication",
      "children": [
        {
          "slug": "apple"
        },
        {
          "slug": "atlassian"
        },
        {
          "slug": "cognito"
        },
        {
          "slug": "discord"
        },
        {
          "slug": "dropbox"
        },
        {
          "slug": "email-password"
        },
        {
          "slug": "facebook"
        },
        {
          "slug": "figma"
        },
        {
          "slug": "github"
        },
        {
          "slug": "gitlab"
        },
        {
          "slug": "google"
        },
        {
          "slug": "huggingface"
        },
        {
          "slug": "kakao"
        },
        {
          "slug": "kick"
        },
        {
          "slug": "line"
        },
        {
          "slug": "linear"
        },
        {
          "slug": "linkedin"
        },
        {
          "slug": "microsoft"
        },
        {
          "slug": "naver"
        },
        {
          "slug": "notion"
        },
        {
          "slug": "other-social-providers"
        },
        {
          "slug": "paybin"
        },
        {
          "slug": "paypal"
        },
        {
          "slug": "polar"
        },
        {
          "slug": "railway"
        },
        {
          "slug": "reddit"
        },
        {
          "slug": "roblox"
        },
        {
          "slug": "salesforce"
        },
        {
          "slug": "slack"
        },
        {
          "slug": "spotify"
        },
        {
          "slug": "tiktok"
        },
        {
          "slug": "twitch"
        },
        {
          "slug": "twitter"
        },
        {
          "slug": "vercel"
        },
        {
          "slug": "vk"
        },
        {
          "slug": "wechat"
        },
        {
          "slug": "zoom"
        }
      ]
    },
    {
      "slug": "plugins",
      "children": [
        {
          "slug": "2fa"
        },
        {
          "slug": "admin"
        },
        {
          "slug": "agent-auth"
        },
        {
          "slug": "anonymous"
        },
        {
          "slug": "api-key",
          "children": [
            {
              "slug": "advanced"
            },
            {
              "slug": "index"
            },
            {
              "slug": "reference"
            }
          ]
        },
        {
          "slug": "autumn"
        },
        {
          "slug": "bearer"
        },
        {
          "slug": "captcha"
        },
        {
          "slug": "chargebee"
        },
        {
          "slug": "community-plugins"
        },
        {
          "slug": "creem"
        },
        {
          "slug": "device-authorization"
        },
        {
          "slug": "dodopayments"
        },
        {
          "slug": "dub"
        },
        {
          "slug": "email-otp"
        },
        {
          "slug": "generic-oauth"
        },
        {
          "slug": "have-i-been-pwned"
        },
        {
          "slug": "i18n"
        },
        {
          "slug": "index"
        },
        {
          "slug": "jwt"
        },
        {
          "slug": "last-login-method"
        },
        {
          "slug": "magic-link"
        },
        {
          "slug": "mcp"
        },
        {
          "slug": "multi-session"
        },
        {
          "slug": "oauth-provider"
        },
        {
          "slug": "oauth-proxy"
        },
        {
          "slug": "oidc-provider"
        },
        {
          "slug": "one-tap"
        },
        {
          "slug": "one-time-token"
        },
        {
          "slug": "open-api"
        },
        {
          "slug": "organization"
        },
        {
          "slug": "passkey"
        },
        {
          "slug": "phone-number"
        },
        {
          "slug": "polar"
        },
        {
          "slug": "scim"
        },
        {
          "slug": "siwe"
        },
        {
          "slug": "sso"
        },
        {
          "slug": "stripe"
        },
        {
          "slug": "test-utils"
        },
        {
          "slug": "username"
        }
      ]
    },
    {
      "slug": "integrations",
      "children": [
        {
          "slug": "astro"
        },
        {
          "slug": "convex"
        },
        {
          "slug": "electron"
        },
        {
          "slug": "elysia"
        },
        {
          "slug": "encore"
        },
        {
          "slug": "expo"
        },
        {
          "slug": "express"
        },
        {
          "slug": "fastify"
        },
        {
          "slug": "hono"
        },
        {
          "slug": "lynx"
        },
        {
          "slug": "nestjs"
        },
        {
          "slug": "next"
        },
        {
          "slug": "nitro"
        },
        {
          "slug": "nuxt"
        },
        {
          "slug": "react-router"
        },
        {
          "slug": "solid-start"
        },
        {
          "slug": "svelte-kit"
        },
        {
          "slug": "tanstack"
        },
        {
          "slug": "waku"
        }
      ]
    },
    {
      "slug": "adapters",
      "children": [
        {
          "slug": "community-adapters"
        },
        {
          "slug": "drizzle"
        },
        {
          "slug": "mongo"
        },
        {
          "slug": "mssql"
        },
        {
          "slug": "mysql"
        },
        {
          "slug": "other-relational-databases"
        },
        {
          "slug": "postgresql"
        },
        {
          "slug": "prisma"
        },
        {
          "slug": "sqlite"
        }
      ]
    },
    {
      "slug": "guides",
      "children": [
        {
          "slug": "auth0-migration-guide"
        },
        {
          "slug": "browser-extension-guide"
        },
        {
          "slug": "clerk-migration-guide"
        },
        {
          "slug": "create-a-db-adapter"
        },
        {
          "slug": "dynamic-base-url"
        },
        {
          "slug": "next-auth-migration-guide"
        },
        {
          "slug": "optimizing-for-performance"
        },
        {
          "slug": "saml-sso-with-okta"
        },
        {
          "slug": "supabase-migration-guide"
        },
        {
          "slug": "workos-migration-guide"
        },
        {
          "slug": "your-first-plugin"
        }
      ]
    },
    {
      "slug": "examples",
      "children": [
        {
          "slug": "astro"
        },
        {
          "slug": "next-js"
        },
        {
          "slug": "nuxt"
        },
        {
          "slug": "react-router"
        },
        {
          "slug": "svelte-kit"
        }
      ]
    },
    {
      "slug": "reference",
      "children": [
        {
          "slug": "contributing"
        },
        {
          "slug": "errors",
          "children": [
            {
              "slug": "account_already_linked_to_different_user"
            },
            {
              "slug": "account_not_linked"
            },
            {
              "slug": "email_doesn't_match"
            },
            {
              "slug": "email_not_found"
            },
            {
              "slug": "index"
            },
            {
              "slug": "internal_server_error"
            },
            {
              "slug": "invalid_callback_request"
            },
            {
              "slug": "invalid_code"
            },
            {
              "slug": "no_callback_url"
            },
            {
              "slug": "no_code"
            },
            {
              "slug": "oauth_provider_not_found"
            },
            {
              "slug": "signup_disabled"
            },
            {
              "slug": "state_mismatch"
            },
            {
              "slug": "state_not_found"
            },
            {
              "slug": "unable_to_create_session"
            },
            {
              "slug": "unable_to_create_user"
            },
            {
              "slug": "unable_to_get_user_info"
            },
            {
              "slug": "unable_to_link_account"
            },
            {
              "slug": "unknown"
            }
          ]
        },
        {
          "slug": "faq"
        },
        {
          "slug": "instrumentation"
        },
        {
          "slug": "options"
        },
        {
          "slug": "resources"
        },
        {
          "slug": "security"
        },
        {
          "slug": "telemetry"
        }
      ]
    },
    {
      "slug": "ai-resources",
      "children": [
        {
          "slug": "index"
        },
        {
          "slug": "mcp"
        },
        {
          "slug": "skills"
        }
      ]
    },
    {
      "slug": "infrastructure",
      "children": [
        {
          "slug": "getting-started"
        },
        {
          "slug": "introduction"
        },
        {
          "slug": "plugins",
          "children": [
            {
              "slug": "audit-logs"
            },
            {
              "slug": "dash"
            },
            {
              "slug": "dashboard"
            },
            {
              "slug": "sentinel"
            }
          ]
        },
        {
          "slug": "services",
          "children": [
            {
              "slug": "email"
            },
            {
              "slug": "sms"
            }
          ]
        }
      ]
    }
  ],
  metadata: {
    titleTemplate: "%s – Docs",
    description: "Generated by @farming-labs/docs Cloud",
  },
});
