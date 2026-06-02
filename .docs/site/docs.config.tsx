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
          "slug": "microsoft"
        },
        {
          "slug": "naver"
        },
        {
          "slug": "notion"
        },
        {
          "slug": "paybin"
        },
        {
          "slug": "other-social-providers"
        }
      ]
    },
    {
      "slug": "plugins",
      "children": [
        {
          "slug": "open-api"
        }
      ]
    }
  ],
  metadata: {
    titleTemplate: "%s – Docs",
    description: "Managed by @farming-labs/docs Cloud",
  },
});
