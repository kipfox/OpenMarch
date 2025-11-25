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

    // Suggest filename for download
    const filename = filePath.split("/").pop();
    if (filename) {
        headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    return new Response(file.body, { headers });
}
