import { readFileSync } from "fs"
import { sync as glob } from "glob"
import { parseQuery } from "libpg-query"
import { DefinitionLink, DefinitionParams, LocationLink, Position, Range } from "vscode-languageserver"

import { getWordRangeAtPosition } from "../helpers"
import { Statement } from "../postgres/statement"
import { console } from "../server"
import { LanguageServerSettings } from "../settings"
import { Resource, Space } from "../space"

type Candidate = { definition: string, definitionLink: DefinitionLink };

export async function loadDefinitionInWorkspace(space: Space, resource: Resource) {
    const settings: LanguageServerSettings = await space.getDocumentSettings(resource)
    const workspace = await space.getWorkSpaceFolder(resource)
    if (workspace === undefined) {
        return
    }

    if (settings.definitionFiles) {
        for (const filePattern of settings.definitionFiles) {
            const files = glob(filePattern)
            try {
                await Promise.all(files.map(async (file) => {
                    resource = `${workspace.uri}/${file}`
                    // console.log(`resource: ${resource}`)
                    await updateFileDefinition(space, resource)
                }))
            }
            catch (error: unknown) {
                console.error(`${error}`)
                continue
            }
        }
    }
}

export async function updateFileDefinition(space: Space, resource: Resource) {
    const query = await parseQuery(readFileSync(resource.replace(/^file:\/\//, "")).toString())

    const stmts = query?.["stmts"]
    if (stmts === undefined) {
        return
    }
    const candidates: Candidate[] = getCreateStmts(stmts, resource)
        .concat(getCompositeTypeStmts(stmts, resource))
        .concat(getCreateFunctionStmts(stmts, resource))

    // console.log(`candidates: ${JSON.stringify(candidates)}`)
    space.definitionMap.updateCandidates(space, resource, candidates)
}

function getCreateStmts(stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const schemaname = stmt?.stmt?.CreateStmt?.relation?.schemaname
            const relname = stmt?.stmt?.CreateStmt?.relation?.relname
            if (schemaname === undefined || relname === undefined) {
                return []
            }
            const definitionLink = LocationLink.create(
                resource,
                Range.create(Position.create(0, 0), Position.create(0, 0)),
                Range.create(Position.create(0, 0), Position.create(0, 0)),
            )
            const candidates = [{
                definition: `${schemaname}.${relname}`,
                definitionLink,
            }]

            if (schemaname === "public") {
                candidates.push({
                    definition: relname,
                    definitionLink,
                })
            }

            return candidates
        })
}

function getCompositeTypeStmts(stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const definition = stmt?.stmt?.CompositeTypeStmt?.typevar?.relname
            if (definition === undefined) {
                return []
            }

            return [{
                definition,
                definitionLink: LocationLink.create(
                    resource,
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                ),
            }]
        })
}

function getCreateFunctionStmts(stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const funcnames = stmt?.stmt?.CreateFunctionStmt?.funcname
            if (funcnames === undefined || funcnames.length === 0) {
                return []
            }

            return funcnames.flatMap(funcname => {
                const definition = funcname?.String?.str
                if (definition === undefined) {
                    return []
                }

                return [{
                    definition,
                    definitionLink: LocationLink.create(
                        resource,
                        Range.create(Position.create(0, 0), Position.create(0, 0)),
                        Range.create(Position.create(0, 0), Position.create(0, 0)),
                    ),
                }]
            })
        })
}

export function getDefinitionLinks(
    space: Space,
    params: DefinitionParams,
): DefinitionLink[] | undefined {
    const uri = params.textDocument.uri
    const document = space.documents.get(uri)
    if (document === undefined) {
        return undefined
    }

    const wordRange = getWordRangeAtPosition(document, params.position)
    if (wordRange === undefined) {
        return undefined
    }

    const word = document.getText(wordRange)
    const sanitizedWord = word
        // for dynamic partition table
        //   (
        //      public."table_name_$$ || partition_key || $$",
        //             "table_name_$$ || partition_key || $$"
        //   )
        .replace(/"([a-zA-Z_]\w*)_\$\$$/, "$1")
        // for quoted table (public."table_name", "table_name")
        .replace(/(^[a-zA-Z_]\w*\.)?"([a-zA-Z_]\w*)"$/, "$1$2")

    // Generic match.
    const definitionLinks = space.definitionMap.getDefinitionLinks(sanitizedWord)
    if (definitionLinks !== undefined) {
        console.log(`word: ${JSON.stringify(word)}, sanitizedWord: ${JSON.stringify(sanitizedWord)}`)
        return definitionLinks
    }

    // Specific match.
    const sanitizedWord2 = word
        // for number partition table (public."table_name_1234", "table_name_1234")
        .replace(/"?([a-zA-Z_]\w*)_[0-9]+"?$/, "$1")
        // for uuid partition table
        //   (
        //      public."table_name_12345678-1234-1234-1234-123456789012",
        //             "table_name_12345678-1234-1234-1234-123456789012"
        //   )
        .replace(/"([a-zA-Z_]\w*)_[0-9]{8}-[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{12}"$/, "$1")

    console.log([
        `word: ${JSON.stringify(word)}`,
        `sanitizedWord: ${JSON.stringify(sanitizedWord)}`,
        `sanitizedWord2: ${JSON.stringify(sanitizedWord2)}`
    ].join(", "))

    return space.definitionMap.getDefinitionLinks(sanitizedWord2)
}
