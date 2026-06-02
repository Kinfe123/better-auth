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
          "slug": "github"
        },
        {
          "slug": "discord"
        },
        {
          "slug": "microsoft"
        },
        {
          "slug": "apple"
        },
        {
          "slug": "facebook"
        },
        {
          "slug": "atlassian"
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
