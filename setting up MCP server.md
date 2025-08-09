# Setting Up a Local MCP Server for Your Codebase

Turning a local codebase into an MCP (Model Context Protocol) server allows Cursor (an AI-powered code editor) to directly use your project’s content and tools in its AI assistant. The MCP server acts as a bridge between Cursor and your codebase, and it can be implemented in a language-agnostic way (any language that can output to stdout or run a web server is supported
docs.cursor.com
). Below are detailed steps to set up a local MCP server for your codebase, the required configuration, and how to register it with Cursor.
Understanding MCP and Language Independence

What is MCP? The Model Context Protocol enables external tools or data sources (like your codebase) to interface with AI assistants. MCP servers expose “tools” (capabilities like reading files, searching code, etc.) that the AI can invoke
docs.cursor.com
. Importantly, MCP is language and framework independent – you can write an MCP server in any language (Python, JavaScript, Go, etc.) as long as it can communicate via stdout or HTTP/SSE streams
docs.cursor.com
. This means the approach will work for any codebase, regardless of the programming language or framework used.

Local vs Remote Servers: Cursor supports multiple transport methods for MCP servers
docs.cursor.com
. For a local codebase, the simplest is to use the STDIO transport, where Cursor spawns a local process for the MCP server (single-user, managed by Cursor). This avoids network complexity. (Cursor also supports SSE or HTTP transports for remote or multi-user servers
docs.cursor.com
, but those are not needed for a purely local setup.)
Choosing an MCP Server Tool for Your Codebase

You have two common approaches to expose your codebase via MCP:

    Official Filesystem MCP Server (from the MCP reference) – This is a lightweight, officially supported server that provides direct filesystem access (read/write/search) within specified directories
    modelcontextprotocol.io
    modelcontextprotocol.io
    . It works with any codebase by treating files as text, so it's language-agnostic.

    Repomix Codebase MCP Server (community tool) – Repomix is a well-supported community tool designed for codebase analysis. When run in MCP mode, it can package an entire codebase into a single artifact and allow searching or retrieving parts of it
    repomix.com
    . It uses tree-sitter to parse many languages (for optional code compression), but it does not require any specific framework – it works on raw code files. This is useful for providing an overview of a project or handling larger repositories.

You can choose either (or even use both). The Filesystem server is great for fine-grained file operations, while Repomix provides higher-level codebase context (like summaries or bulk content).
Setting Up the MCP Server Locally
1. Prerequisites

    Node.js installed: Many MCP servers (including the official Filesystem and Repomix) are distributed as Node.js packages. Ensure you have Node.js available and working (node --version)
    modelcontextprotocol.io
    . If not, install the LTS version from nodejs.org
    modelcontextprotocol.io
    .

    (If using a Python-based server instead, ensure Python is installed. The official mcp-server-git is an example of a Python MCP server
    modelcontextprotocol.io
    , but for codebases we’ll focus on the Node tools above.)

2. Installing or Running the MCP Server

Official Filesystem Server: This server is available as an npm package named @modelcontextprotocol/server-filesystem. You don’t need to manually install it globally – you can run it via npx which will fetch it on first use. Cursor can do this automatically, but to test it, you could run:

npx -y @modelcontextprotocol/server-filesystem /path/to/your/codebase

Replace /path/to/your/codebase with the directory path you want the AI to access. This command would launch the MCP server in your terminal, allowing that path. (In practice, Cursor will run a similar command under the hood via configuration, so you usually don't run it manually except for troubleshooting.)

Repomix Server: Repomix is also an npm package (repomix). You can similarly run it via npx. For example, to start Repomix in MCP mode from a terminal:

npx -y repomix --mcp

This launches the Repomix MCP server, which will wait for requests from an AI client. Repomix will expose tools like pack_codebase, read_repomix_output, and others when connected
repomix.com
repomix.com
. (Again, running it manually is optional; Cursor can spawn it when configured.)

    Note: When using the STDIO transport, you typically don’t need to keep a terminal open after integrating with Cursor – Cursor will spawn the process as needed. Ensure your system’s security settings allow spawning these subprocesses. 

Configuring Cursor to Use the MCP Server

Once you have chosen the server approach, you need to register it with Cursor so that Cursor knows how to launch/connect to it. This is done via an MCP configuration JSON file.

Where to put the config: You can define MCP servers either per project or globally:

    For a single project, create a file at <your project>/.cursor/mcp.json
    docs.cursor.com
    .

    For a global configuration (available in all projects), use ~/.cursor/mcp.json in your home directory
    docs.cursor.com
    .

Config format: In the JSON, you list each server by a name with the command to run. For example, an entry for the Filesystem server might look like this (from official docs):

{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Path/To/Your/Codebase"
      ]
    }
  }
}

In this configuration
modelcontextprotocol.io
:

    "filesystem" is an arbitrary name for the server (this name will show up in Cursor’s UI).

    "command": "npx" tells Cursor to use npx to run the package.

    The "args" array includes "-y" (to auto-confirm package install) and then the package name @modelcontextprotocol/server-filesystem, followed by one or more allowed directory paths. In this case, we allow the /Path/To/Your/Codebase directory. You can list multiple directories here if needed (each path separated by a comma in the JSON array)
    modelcontextprotocol.io
    modelcontextprotocol.io
    . Only these paths will be accessible to the AI for safety.

For Repomix, the config is similar but without needing a path (Repomix will prompt for a directory when used, or you pass it as a tool parameter). An example mcp.json entry for Repomix is:

{
  "mcpServers": {
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}

repomix.com
This tells Cursor to run npx -y repomix --mcp to start the server. (If you prefer not to use Node/npx, the Repomix docs note you can run it via Docker as well
repomix.com
, but using npx is straightforward.)

Environment Variables: If your MCP server requires API keys or tokens (for example, if you were using the GitHub MCP server to index private repos), you can supply those in an "env" field in the config
modelcontextprotocol.io
. For a local codebase server like Filesystem or Repomix, this usually isn’t needed, unless the tool itself needs an API (Repomix doesn’t for local use).

Save and Restart: After creating or editing mcp.json, save it. Then restart Cursor to load the new configuration (Cursor reads the config at startup to launch MCP processes). On restart, Cursor will attempt to start the configured MCP servers. In case of any issues, you can check MCP Logs in Cursor (via Output panel > MCP Logs) to see errors or confirm it started
docs.cursor.com
.
Verifying Integration with Cursor

After restarting, open Cursor’s chat (the “Composer” or agent chat). You should notice the new MCP server listed among the available tools:

    Cursor’s interface typically shows an “Available Tools” section in the chat sidebar or at the top of the chat. Your server name (e.g. “filesystem” or “repomix”) should appear there if it started correctly
    modelcontextprotocol.io
    . In Cursor, you can also go to Settings > Features > Model Context Protocol to see a list of enabled MCP servers and toggle them on/off
    docs.cursor.com
    .

    Approve tool usage: By default, Cursor’s AI agent will ask for permission before using an MCP tool. For example, if it tries to read a file via the Filesystem server, you’ll get a prompt to approve that action
    modelcontextprotocol.io
    modelcontextprotocol.io
    . You can allow it, or even enable "auto-run" (Yolo mode) if you want to skip prompts for trusted tools
    docs.cursor.com
    .

    Using the tools: You can now instruct the AI about your codebase. For instance, with the Filesystem server, you could ask, “Open the README.md file” or “Search for uses of myFunction in the project”, and the AI can call the appropriate tool (file read or search) to get the info. With Repomix, you might say “Summarize the codebase” – the AI could invoke the pack_codebase tool which generates an XML summary of the entire codebase
    repomix.com
    , then the AI can read or query that summary (using grep_repomix_output to find specifics, etc.
    repomix.com
    repomix.com
    ). All these tool invocations and their outputs will be shown in the chat with expandable details for transparency
    docs.cursor.com
    .


Required Configuration and Security Considerations

Security note: When configuring `.cursor/mcp.json`, whitelist only the specific project directory (avoid pointing to your home directory). Treat MCP servers as privileged: validate and sanitize any file paths generated by models (reject absolute paths and `..` segments), and avoid giving broad write access outside the project root.

To recap the required configuration steps in a concise list:

    Install Node and the MCP server package (if not already installed via npx). For Filesystem, Node.js is required, and the package will auto-install on first run. For Repomix, the npx command will fetch it if not present.

    Create the mcp.json config (global or project-specific) with an entry for your server. Include the command (npx) and args (package name and any required parameters like directory paths).

    Restart Cursor to load the new config. Verify the server appears in Cursor’s MCP tools list and is enabled.

    Use the Cursor chat to invoke the server’s tools – either by asking naturally (the AI will decide to use the tool if relevant) or by explicitly calling the tool name in your prompt. Approve the actions when prompted, unless you’ve enabled auto-approval.


By following these steps and using the cited tools, you can successfully turn your local codebase into an MCP server and integrate it with Cursor. This setup will work for any programming language or framework, since the MCP server treats your code as data (via file I/O or text embeddings) and is not tied to specific runtime frameworks. With the MCP integration in place, Cursor’s AI assistant can truly “understand” and navigate your project, making it much more powerful for coding assistance and context-specific queries.