import * as assert from "assert"
import dedent from "ts-dedent"
import {
  DefinitionLink, LocationLink, Position, Range, URI,
} from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"

import { getDefinitionFileResource } from "@/__tests__/helpers/file"
import { setupTestServer } from "@/__tests__/helpers/server"
import { Server } from "@/server/server"
import { TextDocumentTestManager } from "@/server/textDocumentManager"
import { SettingsBuilder } from "@/settings"

import { updateFileDefinition } from "./definition"


describe("Definition Tests", () => {
  let server: Server

  beforeEach(() => {
    const settings = new SettingsBuilder().build()
    server = setupTestServer(settings)
  })

  afterEach(async () => {
    for (const pgPool of server.pgPools.values()) {
      await pgPool.end()
    }
  })

  async function onDefinition(
    definitionResource: URI,
    content: string,
    position = Position.create(0, 0),
  ): Promise<DefinitionLink[] | undefined> {
    const textDocument = TextDocument.create("test.pgsql", "postgres", 0, content);

    (server.documents as TextDocumentTestManager).set(textDocument)

    await updateFileDefinition(
      server.definitionMap,
      definitionResource,
      (await server.settings.get(textDocument.uri)).defaultSchema,
    )

    if (server.handlers === undefined) {
      throw new Error("handlers is undefined")
    }

    return server.handlers.onDefinition({
      position,
      textDocument,
    })
  }

  function validateDefinitionLinks(
    definitoins: DefinitionLink[] | undefined,
    expectedDefinitions: DefinitionLink[],
  ) {
    expect(definitoins).toBeDefined()
    if (definitoins === undefined) return

    assert.deepEqual(definitoins, expectedDefinitions)
  }

  describe("Definition", function () {
    it("Definition on table", async () => {
      const definitionResource = getDefinitionFileResource("tables/companies.pgsql")
      const definition = await onDefinition(definitionResource, "companies")

      validateDefinitionLinks(definition, [
        LocationLink.create(
          definitionResource,
          Range.create(0, 39, 5, 1),
          Range.create(2, 13, 2, 22),
        ),
      ])
    })

    it("Definition on table with default schema", async () => {
      const definitionResource = getDefinitionFileResource("tables/public_users.pgsql")
      const definition = await onDefinition(definitionResource, "public.users")

      validateDefinitionLinks(definition, [
        LocationLink.create(
          definitionResource,
          Range.create(0, 42, 6, 1),
          Range.create(2, 13, 2, 25),
        ),
      ])
    })

    it("Definition on table with non-default schema", async () => {
      const definitionResource = getDefinitionFileResource(
        "tables/campaign_participants.pgsql",
      )
      const definition = await onDefinition(definitionResource, "campaign.participants")

      validateDefinitionLinks(definition, [
        LocationLink.create(
          definitionResource,
          Range.create(0, 51, 6, 1),
          Range.create(2, 13, 2, 34),
        ),
      ])
    })

    it("Definition on view", async () => {
      const definitionResource = getDefinitionFileResource("views/deleted_users.pgsql")
      const definition = await onDefinition(definitionResource, "deleted_users")

      validateDefinitionLinks(definition, [
        LocationLink.create(
          definitionResource,
          Range.create(0, 42, 9, 20),
          Range.create(2, 12, 2, 25),
        ),
      ])
    })

    it("Definition with language server disable comment", async () => {
      const definitionResource = getDefinitionFileResource("tables/companies.pgsql")
      const definition = await onDefinition(
        definitionResource,
        dedent`
          -- plpgsql-language-server:disable

          companies
        `,
        Position.create(3, 0),
      )

      expect(definition).toBeUndefined()
    })

    it("Definition with language server disable block comment", async () => {
      const definitionResource = getDefinitionFileResource("tables/companies.pgsql")
      const definition = await onDefinition(
        definitionResource,
        dedent`
          /* plpgsql-language-server:disable */

          companies
        `,
        Position.create(3, 0),
      )

      expect(definition).toBeUndefined()
    })
  })
})
