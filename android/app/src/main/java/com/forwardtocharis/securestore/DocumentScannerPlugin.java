package com.forwardtocharis.securestore;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.InputStream;

import static com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_PDF;
import static com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL;

@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> scanLauncher;
    private PluginCall savedCall;

    @Override
    public void load() {
        scanLauncher = getActivity().registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                this::handleScanResult
        );
    }

    private void handleScanResult(ActivityResult result) {
        if (savedCall == null) return;
        PluginCall call = savedCall;
        savedCall = null;

        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("cancelled");
            return;
        }

        try {
            GmsDocumentScanningResult scanResult =
                    GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
            GmsDocumentScanningResult.Pdf pdf = scanResult.getPdf();
            Uri pdfUri = pdf.getUri();

            InputStream is = getContext().getContentResolver().openInputStream(pdfUri);
            byte[] bytes = is.readAllBytes();
            is.close();

            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("pdfBase64", base64);
            ret.put("pageCount", pdf.getPageCount());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read scan result: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void scanDocument(PluginCall call) {
        this.savedCall = call;

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(false)
                .setPageLimit(20)
                .setResultFormats(RESULT_FORMAT_PDF)
                .setScannerMode(SCANNER_MODE_FULL)
                .build();

        GmsDocumentScanning.getClient(options)
                .getStartScanIntent(getActivity())
                .addOnSuccessListener(intentSender -> {
                    IntentSenderRequest request =
                            new IntentSenderRequest.Builder(intentSender).build();
                    scanLauncher.launch(request);
                })
                .addOnFailureListener(e -> {
                    savedCall = null;
                    call.reject("Scanner unavailable: " + e.getMessage());
                });
    }
}
