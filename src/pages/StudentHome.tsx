import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, Loader2 } from "lucide-react";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine: string | null;
  emoji: string | null;
  description: string | null;
  is_open: boolean;
}

const StudentHome = () => {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("restaurants")
      .select("id,name,slug,cuisine,emoji,description,is_open")
      .order("name")
      .then(({ data }) => {
        setRestaurants(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      <section className="bg-gradient-hero text-primary-foreground">
        <div className="container pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="max-w-2xl animate-fade-in">
            <Badge className="mb-4 border-0 bg-forest text-primary-foreground hover:bg-forest">Skip the line</Badge>
            <h1 className="font-display text-3xl font-bold leading-tight sm:text-5xl">
              Pre-order. Pickup. <span className="text-forest-light">Eat in 10.</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm text-primary-foreground/75 sm:text-base">
              Order ahead from your favourite IBA campus restaurants. Real-time confirmations, no queues.
            </p>
          </div>
        </div>
      </section>

      <section className="container -mt-6 pb-16">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold sm:text-2xl">Campus restaurants</h2>
            <p className="text-sm text-muted-foreground">Tap any vendor to view today's menu</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((r) => (
              <Link key={r.id} to={`/restaurant/${r.slug}`}>
                <Card className="group flex h-full flex-col overflow-hidden border-border/60 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                  <div className="flex aspect-[5/3] items-center justify-center bg-gradient-hero text-6xl">
                    <span>{r.emoji}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-lg font-bold text-navy">{r.name}</h3>
                        <p className="text-xs text-muted-foreground">{r.cuisine}</p>
                      </div>
                      {r.is_open ? (
                        <Badge variant="secondary" className="bg-accent text-forest hover:bg-accent">
                          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-forest" />
                          Open
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Closed</Badge>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ~10 min</span>
                      <span className="flex items-center gap-1 font-medium text-forest transition-transform group-hover:translate-x-0.5">
                        View menu <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudentHome;
