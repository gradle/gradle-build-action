import * as exec from "@actions/exec";


export async function execute(executable: string, root: string, argv: string[]): Promise<BuildResult> {

    let publishing = false;
    let buildScanLink: any = null;

    await exec.exec(executable, argv, {
        cwd: root,
        listeners: {
            stdline: (line: string) => {
                if (line.startsWith("Publishing build scan...")) {
                    publishing = true;
                }
                if (publishing && line.length == 0) {
                    publishing = false
                }
                if (publishing && line.startsWith("http")) {
                    buildScanLink = line.trim();
                    publishing = false
                }
            }
        }
    });

    if (buildScanLink != null) {
        return new BuildResultImpl(buildScanLink.toString());
    }
    return new BuildResultImpl(null as unknown as string);
}

export interface BuildResult {
    buildScanUrl: string
}

class BuildResultImpl implements BuildResult {
    constructor(readonly buildScanUrl: string) {
    }
}
