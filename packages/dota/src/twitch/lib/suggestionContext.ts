import { AsyncLocalStorage } from 'node:async_hooks'

// Carries the per-command-invocation suggestion suffix from CommandHandler
// (which decides + sets it) through to chatClient.say (which consumes it on
// the first outgoing message). Lives in its own module so chatClient can
// import it without transitively pulling in CommandHandler — that loads all
// commands and runs a top-level supabase query, which breaks unrelated test
// harnesses that don't expect chatClient to fan out that far.
export const suggestionContext = new AsyncLocalStorage<{ suffix: string | null }>()
