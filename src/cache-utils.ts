export function truncateArgs(args: string): string {
    return args.trim().replace(/\s+/g, ' ').substr(0, 400)
}
