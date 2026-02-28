"""
MCP Server for aeli_lobster project.
This is a basic MCP (Model Context Protocol) server implementation.
"""

from typing import Any
import json


class MCPServer:
    """Base MCP Server class."""
    
    def __init__(self, name: str = "aeli_lobster_server"):
        self.name = name
        self.tools = {}
        self.resources = {}
    
    def register_tool(self, name: str, handler: callable):
        """Register a tool with the MCP server."""
        self.tools[name] = handler
    
    def register_resource(self, uri: str, handler: callable):
        """Register a resource with the MCP server."""
        self.resources[uri] = handler
    
    async def handle_request(self, request: dict) -> dict:
        """Handle incoming MCP requests."""
        method = request.get("method")
        params = request.get("params", {})
        
        if method == "tools/list":
            return {"tools": list(self.tools.keys())}
        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})
            if tool_name in self.tools:
                result = await self.tools[tool_name](**tool_args)
                return {"content": [{"type": "text", "text": str(result)}]}
            return {"error": f"Tool '{tool_name}' not found"}
        elif method == "resources/list":
            return {"resources": list(self.resources.keys())}
        elif method == "resources/read":
            resource_uri = params.get("uri")
            if resource_uri in self.resources:
                result = await self.resources[resource_uri]()
                return {"contents": [{"uri": resource_uri, "text": str(result)}]}
            return {"error": f"Resource '{resource_uri}' not found"}
        else:
            return {"error": f"Unknown method: {method}"}


# Example tool handlers
async def echo_handler(message: str) -> str:
    """Echo back the message."""
    return f"Echo: {message}"

async def get_server_info() -> dict:
    """Get server information."""
    return {
        "name": "aeli_lobster_server",
        "version": "1.0.0",
        "description": "MCP Server for aeli_lobster project"
    }

async def list_files_handler(path: str = ".") -> list:
    """List files in a directory."""
    import os
    try:
        files = os.listdir(path)
        return {"path": path, "files": files}
    except Exception as e:
        return {"error": str(e)}


# Initialize the server
server = MCPServer("aeli_lobster_server")

# Register default tools
server.register_tool("echo", echo_handler)
server.register_tool("get_server_info", get_server_info)
server.register_tool("list_files", list_files_handler)


if __name__ == "__main__":
    print(f"MCP Server '{server.name}' initialized")
    print(f"Available tools: {list(server.tools.keys())}")
