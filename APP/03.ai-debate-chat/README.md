# AI Debate Chat

Two distinct AI speakers debate a single user-supplied topic inside the shared harness.

## Acceptance checks

- The user sees the topic composer above the fold as the primary first action and can start the debate from there.
- The UI renders a real chat-style debate timeline with a central arena feel, not a dashboard card grid.
- The debate is generated through the standard harness path `POST /api/exec`.
- The two speakers maintain different stances and answer each other, not just emit unrelated summaries.
- The visual language avoids glassmorphism, badge-heavy templates, and generic SaaS card layouts.
- The empty state still feels intentional and battle-ready before any transcript exists.

## Runtime notes

- Mount path: `/apps/ai-debate-chat`
- Working directory: `APP/03.ai-debate-chat`
- App type: `native-static`
