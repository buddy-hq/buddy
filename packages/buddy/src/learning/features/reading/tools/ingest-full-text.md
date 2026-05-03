
Load a prepared resource's full text into live context after validating context headroom against the active model limits.
What this tool does:
      - resolves a resource by alias or ID
      - requires the resource to be prepared and expose a full-text file
      - estimates live session usage and compares it with model input/context limits
      - ingests full text only when enough post-ingestion reserve remains
Use this when the user needs grounded answers from the entire resource (for example books, papers, or long-form docs), not just individual chunks.
    
