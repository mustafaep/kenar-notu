package com.kenarnotu.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.ArrayList;

/**
 * Paylaşılan ve panoya kopyalanan dosyaları (PDF, PNG) diğer uygulamalara
 * geçici okuma izniyle sunan küçük içerik sağlayıcı. Yalnızca önbellekteki "share" klasörünü açar.
 */
public class FilesProvider extends ContentProvider {
    static final String AUTHORITY = "com.kenarnotu.app.files";

    static Uri uriFor(File f) {
        return Uri.parse("content://" + AUTHORITY + "/share/" + Uri.encode(f.getName()));
    }

    File fileFor(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null || n.contains("/") || n.contains("..") || getContext() == null) return null;
        return new File(new File(getContext().getCacheDir(), "share"), n);
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null) return "application/octet-stream";
        n = n.toLowerCase();
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f = fileFor(uri);
        if (f == null || !f.exists()) return null;
        String[] cols = projection == null ? new String[]{"_display_name", "_size"} : projection;
        ArrayList<String> outCols = new ArrayList<String>();
        ArrayList<Object> row = new ArrayList<Object>();
        for (String c : cols) {
            if ("_display_name".equals(c)) { outCols.add(c); row.add(f.getName()); }
            else if ("_size".equals(c)) { outCols.add(c); row.add(f.length()); }
        }
        MatrixCursor mc = new MatrixCursor(outCols.toArray(new String[0]), 1);
        mc.addRow(row.toArray());
        return mc;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(String.valueOf(uri));
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
