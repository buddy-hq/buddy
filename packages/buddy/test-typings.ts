import { spawn } from "child_process"
const cp = spawn("ls")
cp.on("error", (e) => console.log(e))
