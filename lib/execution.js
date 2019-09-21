"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
function execute(executable, root, argv) {
    return __awaiter(this, void 0, void 0, function* () {
        let publishing = false;
        let buildScanLink = null;
        yield exec.exec(executable, argv, {
            cwd: root,
            listeners: {
                stdline: (line) => {
                    if (line.startsWith("Publishing build scan...")) {
                        publishing = true;
                    }
                    if (publishing && line.length == 0) {
                        publishing = false;
                    }
                    if (publishing && line.startsWith("http")) {
                        buildScanLink = line.trim();
                        publishing = false;
                    }
                }
            }
        });
        if (buildScanLink != null) {
            return new BuildResultImpl(buildScanLink.toString());
        }
        return new BuildResultImpl(null);
    });
}
exports.execute = execute;
class BuildResultImpl {
    constructor(buildScanUrl) {
        this.buildScanUrl = buildScanUrl;
    }
}
