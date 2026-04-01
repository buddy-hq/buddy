export async function installCli() {
  try {
    const path = await window.api.installCli()
    window.alert(`CLI available at ${path}`)
  } catch (error) {
    window.alert(`Failed to install CLI: ${String(error)}`)
  }
}
