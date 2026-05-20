param(
    [string]$OutputPath = "start-mcp-servers.env"
)

$ErrorActionPreference = "Stop"

function Get-ContainerEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Container,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $envJson = docker inspect $Container --format '{{json .Config.Env}}' | ConvertFrom-Json
    foreach ($entry in $envJson) {
        if ($entry.StartsWith("$Name=")) {
            return $entry.Substring($Name.Length + 1)
        }
    }

    throw "Environment variable $Name was not found in container $Container"
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line.StartsWith("$Name=")) {
            return $line.Substring($Name.Length + 1)
        }
    }

    throw "Environment variable $Name was not found in $Path"
}

$image2McpEnvPath = "C:\Users\rob.lavin\OneDrive - MAI Capital Management\PY Scripting\Image2MCP\.env"
$msftEmailMcpEnvPath = "C:\Users\rob.lavin\OneDrive - MAI Capital Management\PY Scripting\MSFT Email MCP Server\.env"

$values = [ordered]@{
    ONETRUST_MCP_API_TOKEN    = Get-ContainerEnvValue "onetrustmcpserver-onetrust-local-mcp-1" "MCP_API_TOKEN"
    AGILEPLACE_MCP_AUTH_TOKEN = Get-ContainerEnvValue "agileplace-mcp-http" "AGILEPLACE_MCP_AUTH_TOKEN"
    LUCID_MCP_BEARER_TOKEN    = Get-ContainerEnvValue "phase-1-lucid-mcp" "DEPLOYMENT_BEARER_KEY"
    IMAGE2MCP_BEARER_TOKEN    = Get-DotEnvValue $image2McpEnvPath "MCP_BEARER_TOKEN"
    MSFT_EMAIL_MCP_AUTH_TOKEN  = Get-DotEnvValue $msftEmailMcpEnvPath "MSFT_EMAIL_MCP_AUTH_TOKEN"
}

$lines = foreach ($key in $values.Keys) {
    "$key=$($values[$key])"
}

Set-Content -LiteralPath $OutputPath -Value $lines -Encoding ascii
Write-Host "Wrote $OutputPath"
