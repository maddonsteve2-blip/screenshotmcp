"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "lucide-react";
import { InstallDialog } from "./install-dialog";

export function Header() {
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  return (
    <>
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Eye className="h-[18px] w-[18px] text-primary" strokeWidth={2.5} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">DeepSyte</h1>
            </div>
            
            <Button
              onClick={() => setShowInstallDialog(true)}
              className="bg-black text-white hover:bg-gray-800"
            >
              <Download className="w-4 h-4 mr-2" />
              Install
            </Button>
          </div>
        </div>
      </header>

      <InstallDialog 
        isOpen={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)} 
      />
    </>
  );
}
