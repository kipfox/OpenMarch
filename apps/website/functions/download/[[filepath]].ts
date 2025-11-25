export async function onRequestGet(ctx) {
    const filePath = new URL(ctx.request.url).pathname.replace(
        "/download/",
        "",
    );
    const file = await ctx.env.DOWNLOADS_BUCKET.get(filePath);
    if (!file) return new Response(null, { status: 404 });

    const headers = {
        "Content-Type":
            file.httpMetadata.contentType || "application/octet-stream",
        "Content-Length": file.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
    };

    // Add ETag if available for cache validation
    if (file.httpEtag) {
        headers["ETag"] = file.httpEtag;
    }

    const versionPattern = /v\d+\.\d+\.\d+/;
    const version = filePath.match(versionPattern)?.[0];
    const extension = filePath.split(".").pop();

    // Write download analytics
    await ctx.env.DOWNLOAD_ANALYTICS.writeDataPoint({
        blobs: ["total", filePath, version, extension],
        doubles: [1],
        indexes: ["download"],
    });

    // Suggest filename for download
    const filename = filePath.split("/").pop();
    if (filename) {
        headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    return new Response(file.body, { headers });
}
