export class PostActionJobFailure extends Error {
    constructor(error: unknown) {
        if (error instanceof Error) {
            super(error.message)
            this.name = error.name
            this.stack = error.stack
        } else {
            super(String(error))
        }
    }
}
