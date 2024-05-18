import type { CancellationToken, ExtensionContext, FileDecoration, FileDecorationProvider, ProviderResult, Uri } from 'vscode'
import { EventEmitter, ThemeColor, commands, window, workspace } from 'vscode'

const EXT_ID = 'tab-picker'

const KEYS = [...'abcdefghijklmnopqrstuvwxyz']

class MyFileDecorationProvider implements FileDecorationProvider {
  private didChangeFileDecorations: EventEmitter<Uri | Uri[] | undefined> = new EventEmitter()
  public onDidChangeFileDecorations = this.didChangeFileDecorations.event

  private uriKeyMap = new Map<string, string>()
  private get keyUriMap() {
    return new Map([...this.uriKeyMap].map(([uri, key]) => [key, uri]))
  }

  private currAction?: 'switch' | 'close'

  constructor(ext: ExtensionContext) {
    ext.subscriptions.push(
      this.didChangeFileDecorations,
      commands.registerCommand(`${EXT_ID}.start`, this.start, this),
      commands.registerCommand(`${EXT_ID}.select`, this.select, this),
      commands.registerCommand(`${EXT_ID}.cancel`, this.cancel, this),
      commands.registerCommand(`${EXT_ID}.getAction`, () => this.currAction, this),
      workspace.onDidCloseTextDocument(this.cleanup, this),
    )
  }

  private start(action: 'switch' | 'close' = 'switch') {
    this.currAction = action
    this.uriKeyMap.clear()

    const docs = workspace.textDocuments.filter((doc) => {
      if (action === 'switch' && doc === window.activeTextEditor?.document)
        return false

      if (['output', 'git', 'vscode-scm'].includes(doc.uri.scheme))
        return false

      return true
    })

    const uris = docs.map(doc => doc.uri)
    if (uris.length) {
      uris.slice(0, KEYS.length).forEach((uri, i) => {
        this.uriKeyMap.set(uri.toString(), KEYS[i])
      })
    }

    this.refresh()
  }

  private async select(key: string) {
    do {
      if (!this.currAction || !this.keyUriMap.has(key)) {
        window.showInformationMessage('Nothing to do')
        break
      }

      const uri = this.keyUriMap.get(key)!
      const doc = workspace.textDocuments.find(doc => doc.uri.toString() === uri)
      let editor = window.visibleTextEditors.find(editor => editor.document === doc)

      if (!doc)
        break

      if (!editor)
        editor = await window.showTextDocument(doc, undefined, false)

      // close
      if (this.currAction === 'close') {
        const activeEditor = window.activeTextEditor
        if (editor === activeEditor) {
          await commands.executeCommand('workbench.action.closeActiveEditor')
        }
        else {
          await window.showTextDocument(editor.document, editor.viewColumn, false)
          await new Promise(resolve => setTimeout(resolve, 50))
          await commands.executeCommand('workbench.action.closeActiveEditor')
          await new Promise(resolve => setTimeout(resolve, 50))
          if (activeEditor)
            await window.showTextDocument(activeEditor.document, activeEditor.viewColumn, false)
        }

        break
      }

      // switch
      if (editor !== window.activeTextEditor)
        await window.showTextDocument(editor.document, editor.viewColumn, false)
    } while (false)

    this.cancel()
  }

  private cancel() {
    this.uriKeyMap.clear()
    this.refresh()
  }

  private cleanup() {
    const docs = workspace.textDocuments
    const uris = [...this.uriKeyMap.keys()]
    const invalidUris = uris.filter(uri => !docs.some(doc => doc.uri.toString() === uri))
    if (!invalidUris.length)
      return

    invalidUris.forEach(uri => this.uriKeyMap.delete(uri))
    this.refresh()
  }

  private refresh() {
    const uris = workspace.textDocuments.map(doc => doc.uri)
    this.didChangeFileDecorations.fire(uris)
  }

  provideFileDecoration(uri: Uri, _token: CancellationToken): ProviderResult<FileDecoration> {
    const key = this.uriKeyMap.get(uri.toString())
    if (!key)
      return
    return {
      badge: key,
      propagate: false,
      color: new ThemeColor('editorError.foreground'),
      tooltip: `Press ${key} to ${this.currAction === 'switch' ? 'switch' : 'close'}`,
    }
  }
}

export function activate(ext: ExtensionContext) {
  const provider = new MyFileDecorationProvider(ext)
  ext.subscriptions.push(
    window.registerFileDecorationProvider(provider),
  )
}

export function deactivate() {
}
