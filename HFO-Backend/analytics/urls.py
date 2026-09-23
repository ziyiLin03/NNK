from django.urls import path
from . import views

urlpatterns = [
    path("meta",               views.AnalyticsMetaView.as_view()),
    path("operational-kpis",   views.OperationalKpisView.as_view()),
    path("demographics-kpis",  views.DemographicsKpisView.as_view()),
    path("incident-needs",     views.IncidentNeedsView.as_view()),
    path("data-quality",       views.DataQualityView.as_view()),
    path("mobility-route",     views.MobilityRouteView.as_view()),
]
