export function installFoliateDomRuntime() {
  const originalParse = DOMParser.prototype.parseFromString
  const originalSetStart = Range.prototype.setStart
  const originalSetEnd = Range.prototype.setEnd
  for (const method of ["setStart", "setEnd"] as const) {
    const original = Range.prototype[method]
    Range.prototype[method] = function (node, offset) {
      const owner = Object.getOwnPropertySymbols(this).find((symbol) => symbol.description === "ownerDocument")
      if (owner && node.ownerDocument) Object.defineProperty(this, owner, { value: node.ownerDocument })
      original.call(this, node, offset)
    }
  }
  const originalIterators = [document, HTMLDocument.prototype, XMLDocument.prototype].map((target) => ({
    target,
    descriptor: Object.getOwnPropertyDescriptor(target, "createNodeIterator"),
  }))
  DOMParser.prototype.parseFromString = function (source, type) {
    const doc = originalParse.call(this, source, type)
    if (type !== "text/html") {
      for (const element of Array.from(doc.querySelectorAll("*"))) {
        const localName = /^[A-Z][A-Z\d-]*$/.test(element.localName) ? element.localName.toLowerCase() : element.localName
        const name = element.prefix ? `${element.prefix}:${localName}` : localName
        Object.defineProperties(element, {
          localName: { configurable: true, value: localName },
          nodeName: { configurable: true, value: name },
          tagName: { configurable: true, value: name },
        })
      }
    }
    return doc
  }
  for (const { target } of originalIterators) {
    target.createNodeIterator = (root, whatToShow = NodeFilter.SHOW_ALL, filter = null) => {
      const visited = new Set<Node>()
      let referenceNode = root
      return {
        root,
        whatToShow,
        filter,
        get referenceNode() { return referenceNode },
        get pointerBeforeReferenceNode() { return visited.size === 0 },
        nextNode: () => {
          const walker = document.createTreeWalker(root, whatToShow, filter)
          const accepted = !filter || ("acceptNode" in filter ? filter.acceptNode(root) : filter(root)) === NodeFilter.FILTER_ACCEPT
          const includesRoot = (whatToShow & (1 << (root.nodeType - 1))) !== 0 && accepted
          for (let node = includesRoot ? root : walker.nextNode(); node; node = walker.nextNode()) {
            if (visited.has(node)) continue
            visited.add(node)
            referenceNode = node
            return node
          }
          return null
        },
        previousNode: () => null,
        detach: () => undefined,
      }
    }
  }
  return () => {
    DOMParser.prototype.parseFromString = originalParse
    Range.prototype.setStart = originalSetStart
    Range.prototype.setEnd = originalSetEnd
    for (const { target, descriptor } of originalIterators) {
      if (descriptor) Object.defineProperty(target, "createNodeIterator", descriptor)
      else Reflect.deleteProperty(target, "createNodeIterator")
    }
  }
}
